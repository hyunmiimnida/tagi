import { createClient } from "@supabase/supabase-js";
import { askAiJson } from "../src/ai.ts";
import { buildTriagePrompt, parseTriage } from "./feedback-triage.ts";

// 아직 AI가 확인하지 않은 문의를 분류·요약해 의견함에 적는다 (scripts/collect-local.ps1이 내 컴퓨터에서 실행).
// 필요한 값: .env.local의 SUPABASE_SERVICE_ROLE_KEY. 없으면 건너뛴다. 실패한 문의는 다음 실행 때 다시 묻는다.
// 문의 내용·요약은 화면에 찍지 않는다 (기록 파일에 남지 않게)

const BATCH = 10;
const LIMIT = 50;

try {
  process.loadEnvFile(".env.local");
} catch {
  // 환경 변수로 받은 경우
}
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("문의 AI 확인: SUPABASE_SERVICE_ROLE_KEY가 없어 건너뜀");
  process.exit(0);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await db
  .from("feedback")
  .select("id, category, body")
  .is("ai_checked_at", null)
  .neq("status", "done")
  .order("created_at")
  .limit(LIMIT);
if (error) throw new Error(`문의 읽기 실패: ${error.message}`);
const rows = (data ?? []) as { id: number; category: string; body: string }[];

let done = 0;
for (let start = 0; start < rows.length; start += BATCH) {
  const batch = rows.slice(start, start + BATCH);
  const answer = await askAiJson(buildTriagePrompt(batch));
  if (!answer) continue;
  const parsed = parseTriage(answer.items, batch.length);
  for (const [i, triage] of parsed.entries()) {
    if (!triage) continue;
    const { error: saveError } = await db
      .from("feedback")
      .update({ ...triage, ai_checked_at: new Date().toISOString() })
      .eq("id", batch[i].id);
    if (saveError) console.error(`문의 #${batch[i].id} 저장 실패: ${saveError.message}`);
    else done++;
  }
}
console.log(`문의 AI 확인: ${rows.length}건 중 ${done}건 완료`);
