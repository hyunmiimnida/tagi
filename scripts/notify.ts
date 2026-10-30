import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { SITE_URL } from "../lib/filter.ts";
import type { Program } from "../src/types.ts";
import { reportAlertMarkdown } from "./report-alert.ts";

// 매일 아침 GitHub Actions(.github/workflows/notify.yml)가 실행한다.
//   node scripts/notify.ts deadline        마감 알림: 내일 모집이 끝나는 관심 공고를 알림을 켠 사람에게 웹 푸시로 보낸다
//   node scripts/notify.ts reports FILE    신고 알림: 아직 알리지 않은 신고·새 의견을 FILE(마크다운)에 적는다 (워크플로가 GitHub 이슈로 올린다)
//   node scripts/notify.ts mark-reported   FILE에 적은 신고를 "알림" 표시한다 (이슈를 만든 뒤에 실행)
// 필요한 값(GitHub Secrets): SUPABASE_SERVICE_ROLE_KEY, VAPID_PRIVATE_KEY. 없으면 아무것도 하지 않고 끝난다.

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = SITE_URL;
const VAPID_PUBLIC_KEY = readFileSync(new URL("../lib/push.ts", import.meta.url), "utf8").match(/VAPID_PUBLIC_KEY = "([^"]+)"/)![1];
const IDS_FILE = "reported-ids.json";

const [mode, file] = process.argv.slice(2);
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.log("SUPABASE_SERVICE_ROLE_KEY가 없어 알림을 건너뜀 (docs/설정-안내.md 참고)");
  process.exit(0);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 1000줄씩 끝까지 읽는다
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(JSON.stringify(error));
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

// 한국 시간으로 내일 날짜 (YYYY-MM-DD)
function tomorrowInKorea(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
}

async function deadline() {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) {
    console.log("VAPID_PRIVATE_KEY가 없어 마감 알림을 건너뜀");
    return;
  }
  webpush.setVapidDetails(`${SITE}/privacy`, VAPID_PUBLIC_KEY, privateKey);

  const programs: Program[] = JSON.parse(readFileSync(new URL("../data/programs.json", import.meta.url), "utf8"));
  // 관심 표시는 합쳐지기 전 예전 id일 수도 있다
  const byId = new Map<string, Program>();
  for (const p of programs) for (const id of [p.id, ...(p.aliases ?? [])]) byId.set(id, p);
  const tomorrow = tomorrowInKorea();

  const users = await all<{ user_id: string }>((a, b) => db.from("profiles").select("user_id").eq("notify_deadline", true).range(a, b));
  let sent = 0;
  for (const { user_id } of users) {
    const favorites = await all<{ program_id: string }>((a, b) => db.from("favorites").select("program_id").eq("user_id", user_id).range(a, b));
    const due = [...new Set(favorites.map((f) => byId.get(f.program_id)).filter((p): p is Program => p?.recruitPeriod.end === tomorrow))];
    if (due.length === 0) continue;
    const subs = await all<{ endpoint: string; p256dh: string; auth: string }>((a, b) =>
      db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", user_id).range(a, b),
    );
    const payload = JSON.stringify({
      title: due.length === 1 ? "내일 마감되는 관심 공고가 있어요" : `내일 마감되는 관심 공고 ${due.length}개`,
      body: due.map((p) => p.title).slice(0, 3).join("\n") + (due.length > 3 ? `\n외 ${due.length - 3}개` : ""),
      url: due.length === 1 ? `/programs/${due[0].id}` : "/calendar",
    });
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 12 * 3600 });
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 알림을 끄거나 앱을 지운 기기는 주소가 없어진다 → 지운다
        if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        else console.error("보내기 실패", status ?? (error as Error).message);
      }
    }
  }
  console.log(`마감 알림: 알림을 켠 사람 ${users.length}명, 보낸 알림 ${sent}개 (내일 ${tomorrow} 마감)`);
}

async function reports(out: string) {
  // 이슈는 공개 저장소에 올라가므로 내용은 읽지도 적지도 않는다. 건수와 관리자 화면 링크만 (scripts/report-alert.ts)
  const comments = await all<{ comment_id: number }>((a, b) => db.from("reports").select("comment_id").is("alerted_at", null).range(a, b));
  const programs = await all<{ id: number }>((a, b) =>
    db.from("program_reports").select("id").is("alerted_at", null).eq("resolved", false).range(a, b),
  );
  // 의견함(supabase/admin.sql). 아직 표를 만들지 않았으면 건너뛴다
  const feedback = await all<{ id: number }>((a, b) => db.from("feedback").select("id").is("alerted_at", null).range(a, b)).catch(() => []);
  writeFileSync(out, reportAlertMarkdown(SITE, { feedback: feedback.length, comments: comments.length, programs: programs.length }));
  writeFileSync(
    IDS_FILE,
    JSON.stringify({ comments: comments.map((r) => r.comment_id), programs: programs.map((r) => r.id), feedback: feedback.map((f) => f.id) }),
  );
  console.log(`신고 알림: 새 의견 ${feedback.length}건, 댓글 신고 ${comments.length}건, 정보 오류 신고 ${programs.length}건`);
}

async function markReported() {
  const ids: { comments: number[]; programs: number[]; feedback?: number[] } = JSON.parse(readFileSync(IDS_FILE, "utf8"));
  const now = new Date().toISOString();
  if (ids.comments.length) await db.from("reports").update({ alerted_at: now }).in("comment_id", ids.comments).is("alerted_at", null);
  if (ids.programs.length) await db.from("program_reports").update({ alerted_at: now }).in("id", ids.programs);
  if (ids.feedback?.length) await db.from("feedback").update({ alerted_at: now }).in("id", ids.feedback);
}

if (mode === "deadline") await deadline();
else if (mode === "reports") await reports(file ?? "reports.md");
else if (mode === "mark-reported") await markReported();
else console.log("사용법: node scripts/notify.ts deadline | reports FILE | mark-reported");
