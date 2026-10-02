import type { PostgrestError } from "@supabase/supabase-js";

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
  user_id: string;
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

export function describeError(error: PostgrestError | { message: string; code?: string }): string {
  const message = error.message ?? "";
  if (message.includes("not_admin")) return "관리자 계정이 아니에요.";
  if (message.includes("cannot_self")) return "내 계정에는 할 수 없어요.";
  if (message.includes("cannot_delete_admin")) return "관리자 계정은 지울 수 없어요.";
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "PGRST205" || error.code === "42P01") {
    return "관리 기능이 아직 설정되지 않았어요. supabase/admin.sql을 Supabase SQL Editor에서 실행해 주세요.";
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
