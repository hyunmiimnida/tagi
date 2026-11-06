import type { PostgrestError } from "@supabase/supabase-js";
import { ODDS, ODDS_TOTAL } from "./gacha.ts";
import type { DrawGrade } from "./gacha.ts";

// 관리자 화면(/admin)에서 함께 쓰는 형식과 도우미(서버를 부르지 않는 순수 계산이라 자동 검사한다).
// 관리 함수 부르기는 lib/admin-rpc.ts, 관리 함수 자체는 supabase/admin.sql에 있다

export interface AdminStats {
  users: number;
  new7: number;
  active7: number;
  notify: number;
  devices: number;
  favorites: number;
  favoriteUsers: number;
  comments: number;
  comments7: number;
  hidden: number;
  openReports: number;
  openProgramReports: number;
  newFeedback: number;
  doingFeedback: number;
  suspended: number;
  signups: { day: string; count: number }[];
  schools: Record<string, number>; // 학교 id → 사람 수 ("" = 고르지 않음)
  statuses: Record<string, number>;
}

export interface AdminUser {
  id: string;
  email: string | null;
  provider: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  nickname: string | null;
  school_id: string | null;
  status: string | null;
  grade: string | null;
  notify: boolean;
  favorites: number;
  comments: number;
  suspended_until: string | null;
  suspended: boolean;
  admin: boolean;
}

export interface AdminUserDetail {
  id: string;
  email: string | null;
  provider: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  nickname: string | null;
  school_id: string | null;
  status: string | null;
  grade: string | null;
  interests: string[];
  notify: boolean;
  rules_agreed_at: string | null;
  admin: boolean;
  devices: number;
  favorites: string[];
  comments: { id: number; series_id: string; body: string; created_at: string; hidden: boolean }[];
  feedback: { id: number; category: string; body: string; status: FeedbackStatus; created_at: string }[];
  reportsReceived: number;
  reportsMade: number;
  blockedBy: number;
  suspension: { until: string | null; reason: string | null; created_at: string; active: boolean } | null;
}

export interface AdminComment {
  id: number;
  series_id: string;
  body: string;
  created_at: string;
  hidden: boolean;
  reviewed_at: string | null;
  user_id: string | null;
  author: string;
  author_suspended: boolean;
  reports: number;
  open_reports: number;
  reasons: string[] | null;
  last_report_at: string | null;
}

export type FeedbackStatus = "new" | "doing" | "done";

export interface Feedback {
  id: number;
  user_id: string | null;
  category: string;
  body: string;
  page: string | null;
  status: FeedbackStatus;
  admin_note: string | null;
  reply: string | null;
  replied_at: string | null;
  ai_type?: string | null;
  ai_urgency?: string | null;
  ai_summary?: string | null;
  created_at: string;
}

export interface ProgramReport {
  id: number;
  program_id: string;
  reason: string;
  note: string | null;
  created_at: string;
  resolved: boolean;
}

export interface Announcement {
  id: number;
  body: string;
  link: string | null;
  level: "info" | "warn";
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface AdminLogEntry {
  id: number;
  admin_id: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: string;
}

export interface Page<T> {
  total: number;
  rows: T[];
}

export const FEEDBACK_STATUS: Record<FeedbackStatus, string> = { new: "새 의견", doing: "확인 중", done: "완료" };
export const PROVIDER_NAMES: Record<string, string> = { kakao: "카카오", google: "구글" };
export const PAGE_SIZE = 30;

// setupFile: 함수가 아직 없을 때 실행하라고 안내할 SQL 파일 (뽑기 관리는 admin-keys.sql)
export function describeError(error: PostgrestError | { message: string; code?: string }, setupFile = "admin.sql"): string {
  const message = error.message ?? "";
  for (const [code, text] of Object.entries(KEY_ERRORS)) if (message.includes(code)) return text;
  if (message.includes("not_admin")) return "관리자 계정이 아니에요.";
  if (message.includes("cannot_self")) return "내 계정에는 할 수 없어요.";
  if (message.includes("cannot_delete_admin")) return "관리자 계정은 지울 수 없어요.";
  if (message.includes("cannot_suspend_admin")) return "관리자 계정은 정지할 수 없어요.";
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "PGRST205" || error.code === "42P01") {
    return `관리 기능이 아직 설정되지 않았어요. supabase/${setupFile}을 Supabase SQL Editor에서 실행해 주세요.`;
  }
  return `처리하지 못했어요. (${message || "알 수 없는 오류"})`;
}

// "10.2 14:05" (올해가 아니면 "2025.10.2 14:05")
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const thisYear = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric" }).formatToParts(new Date()).find((p) => p.type === "year")?.value;
  const day = `${get("month")}.${get("day")}`;
  return `${get("year") === thisYear ? day : `${get("year")}.${day}`} ${get("hour")}:${get("minute")}`;
}

// "방금", "5분 전", "3시간 전", "2일 전", 그보다 오래되면 날짜
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "-";
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
  if (minutes < 60 * 24 * 30) return `${Math.floor(minutes / 60 / 24)}일 전`;
  return formatDateTime(iso).split(" ")[0];
}

// 탭 이름 옆 빨간 숫자: 그 탭에서 처리할 일이 몇 개 남았는지
export function pendingCount(stats: AdminStats | null, tab: string): number {
  if (!stats) return 0;
  if (tab === "feedback") return stats.newFeedback;
  if (tab === "comments") return stats.openReports;
  if (tab === "reports") return stats.openProgramReports;
  return 0;
}

// 살펴볼 수집 출처: 켜져 있는데 마지막 실행이 실패했거나, 성공 기록이 없거나, staleDays일 넘게 성공하지 못한 곳
export function sourceProblems<S extends { enabled: boolean; ok: boolean | null; lastSuccessAt: string | null }>(
  sources: S[],
  now: number,
  staleDays = 3,
): S[] {
  return sources.filter(
    (s) => s.enabled && (s.ok === false || !s.lastSuccessAt || now - Date.parse(s.lastSuccessAt) > staleDays * 86_400_000),
  );
}

// ───────── 뽑기 관리 (supabase/admin-keys.sql) ─────────

const KEY_ERRORS: Record<string, string> = {
  "keys:amount": "1개에서 10000개 사이로 적어 주세요.",
  "keys:reason": "이유를 적어 주세요.",
  "keys:no_user": "없는 회원이에요.",
  "weapon:owned": "이미 가진 무기예요.",
  "weapon:unknown": "뽑기에 나오는 무기만 줄 수 있어요.",
  "weapon:not_owned": "갖고 있지 않은 무기예요.",
};

export type KeyReason =
  | "welcome"
  | "daily"
  | "review"
  | "review_undo"
  | "draw"
  | "refund"
  | "admin_grant"
  | "admin_revoke"
  | "weapon_grant"
  | "weapon_revoke"
  | "shard_exchange";

export const KEY_REASONS: Record<KeyReason, string> = {
  welcome: "처음 온 선물",
  daily: "접속 선물",
  review: "후기 보상",
  review_undo: "후기 삭제 회수",
  draw: "뽑기",
  refund: "중복 무기 돌려받기",
  admin_grant: "관리자 지급",
  admin_revoke: "관리자 회수",
  weapon_grant: "무기 지급",
  weapon_revoke: "무기 회수",
  shard_exchange: "파편 → 전설 무기",
};

export const GRADE_NAMES: Record<DrawGrade, string> = { common: "일반", rare: "희귀", heroic: "영웅", legendary: "전설", shard: "전설의 파편" };

export interface KeyLedgerRow {
  id: number;
  user_id: string;
  nickname: string;
  change: number;
  reason: KeyReason;
  detail: string | null; // 무기 id·shard·댓글 번호·관리자가 적은 이유
  series_id: string | null;
  debt_paid: number;
  created_at: string;
  balance: number; // 이 기록 뒤 남은 열쇠조각
}

export interface DrawRow {
  id: number;
  user_id: string;
  nickname: string;
  weapon_id: string;
  grade: DrawGrade | null;
  refund: number | null;
  duplicate: boolean;
  created_at: string;
}

export interface UserKeys {
  keys: number;
  shards: number;
  debt: number;
  last_daily: string | null;
  draws: number;
  weapons: { weapon_id: string; obtained_at: string; source: "draw" | "admin" | "none" }[];
}

export interface GachaStats {
  today: { given: Partial<Record<KeyReason, number>>; revoked: number; draws: number; drawers: number };
  grades: Partial<Record<DrawGrade | "unknown", number>>;
  wallets: { keys: number; shards: number; people: number };
}

export type IssueKind =
  | "orphan_weapon"
  | "missing_weapon"
  | "wallet"
  | "debt"
  | "shards"
  | "daily_twice"
  | "review_over"
  | "review_series"
  | "welcome_twice"
  | "draw_cost"
  | "negative"
  | "refund_orphan"
  | "lucky";

export const ISSUE_KINDS: Record<IssueKind, string> = {
  orphan_weapon: "뽑기·지급 기록 없는 무기",
  missing_weapon: "뽑았는데 없는 무기",
  wallet: "열쇠조각이 기록의 합과 다름",
  debt: "못 돌려받은 양이 기록과 다름",
  shards: "전설의 파편 수가 기록과 다름",
  daily_twice: "접속 선물을 하루에 두 번 넘게",
  review_over: "후기 보상을 하루에 3번 넘게",
  review_series: "같은 프로그램 후기 보상을 두 번 넘게",
  welcome_twice: "처음 온 선물을 두 번 넘게",
  draw_cost: "뽑기 비용이 5개가 아님",
  negative: "열쇠조각이 모자란데 뽑음",
  refund_orphan: "뽑기 없이 돌려받기",
  lucky: "영웅이 너무 많이 나옴 (확인 필요)",
};

export interface IntegrityIssue {
  user_id: string;
  nickname: string;
  admin: boolean;
  kind: IssueKind;
  detail: string;
}

export interface IntegrityResult {
  checked_at: string;
  people: number;
  issues: IntegrityIssue[];
  tables: { table: string; rls: boolean; write_grant: boolean; write_policies: number }[];
}

// 사람마다 문제를 묶는다 (확인 필요(lucky)만 있는 사람은 뒤로)
export function groupIssues(issues: IntegrityIssue[]): { user_id: string; nickname: string; admin: boolean; issues: IntegrityIssue[] }[] {
  const people = new Map<string, { user_id: string; nickname: string; admin: boolean; issues: IntegrityIssue[] }>();
  for (const issue of issues) {
    const person = people.get(issue.user_id) ?? { user_id: issue.user_id, nickname: issue.nickname, admin: issue.admin, issues: [] };
    person.issues.push(issue);
    people.set(issue.user_id, person);
  }
  const onlyCheck = (p: { issues: IntegrityIssue[] }) => p.issues.every((i) => i.kind === "lucky");
  return [...people.values()].sort((a, b) => Number(onlyCheck(a)) - Number(onlyCheck(b)));
}

// 표 보호가 깨진 곳: RLS가 꺼졌거나 손님·로그인 사용자에게 쓰기 규칙이 있거나 쓰기 권한이 남아 있음
export function tableProblems(tables: IntegrityResult["tables"]): string[] {
  return tables.flatMap((t) => [
    ...(t.rls ? [] : [`${t.table}: 줄 보호(RLS)가 꺼져 있어요`]),
    ...(t.write_policies > 0 ? [`${t.table}: 쓰기 규칙이 ${t.write_policies}개 있어요`] : []),
    ...(t.write_grant ? [`${t.table}: 손님·로그인 사용자에게 쓰기 권한이 남아 있어요`] : []),
  ]);
}

// 실제 뽑기 결과의 등급 비율과 설정 확률 (%) — 관리자 화면에만 보인다
export function gradeShares(grades: GachaStats["grades"]): { grade: DrawGrade; count: number; actual: number | null; expected: number }[] {
  const total = ODDS.reduce((n, [grade]) => n + (grades[grade] ?? 0), 0);
  return ODDS.map(([grade, weight]) => {
    const count = grades[grade] ?? 0;
    return { grade, count, actual: total ? (count / total) * 100 : null, expected: (weight / ODDS_TOTAL) * 100 };
  });
}

// 기간 → 시작 시각. today는 한국 날짜의 0시
export type Period = "today" | "7" | "30" | "all";
export function sinceOf(period: Period, now = Date.now()): string | null {
  if (period === "all") return null;
  if (period === "today") {
    const kst = new Date(now + 9 * 3_600_000);
    return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3_600_000).toISOString();
  }
  return new Date(now - Number(period) * 86_400_000).toISOString();
}
