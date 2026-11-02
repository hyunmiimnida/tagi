// 후기 입력과 통계에서 쓰는 항목은 이곳에서 함께 관리한다.
export const PARTICIPATION_OPTIONS = [
  { value: "joined", label: "참여했어요" },
  { value: "not_selected", label: "신청했지만 선정되지 않았어요" },
  { value: "dropped", label: "신청했지만 참여하지 못했어요" },
] as const;
export const REVIEW_ITEMS = [
  { key: "content", label: "내용이 도움이 됐나요" },
  { key: "apply", label: "신청 과정이 쉬웠나요" },
  { key: "operation", label: "운영과 안내가 좋았나요" },
  { key: "schedule", label: "일정이 공지와 같았나요" },
  { key: "benefit", label: "혜택을 안내대로 받았나요" },
] as const;
export const AGAIN_OPTIONS = [
  { value: "yes", label: "네" }, { value: "no", label: "아니요" }, { value: "unsure", label: "잘 모르겠어요" },
] as const;
export const STAR_VALUES = [1, 2, 3, 4, 5] as const;
export type Participation = typeof PARTICIPATION_OPTIONS[number]["value"];
export type ReviewItem = typeof REVIEW_ITEMS[number]["key"];
export type ReviewScores = Record<`rating_${ReviewItem | "overall"}`, number | null>;
export type Again = typeof AGAIN_OPTIONS[number]["value"];
export interface ReviewDraft extends ReviewScores {
  program_id: string;
  participation: Participation | "";
  again: Again | null;
}
export interface ReviewRound { id: string; title: string; closed: boolean; recruitEnd?: string | null }
// 상세 화면은 미리 만든다. 알려진 모집 마감일은 화면을 여는 날에도 다시 확인한다.
export function reviewRoundsForToday(rounds: ReviewRound[], today: string): ReviewRound[] {
  return rounds.map((round) => today && round.recruitEnd ? { ...round, closed: round.recruitEnd < today } : round);
}
export function writableReviewRounds(rounds: ReviewRound[]) { return rounds.filter((round) => round.closed); }
export function emptyReview(programId: string): ReviewDraft {
  return { program_id: programId, participation: "", rating_overall: null, rating_content: null,
    rating_apply: null, rating_operation: null, rating_schedule: null, rating_benefit: null, again: null };
}
export function reviewPayload(draft: ReviewDraft, enabled: boolean, kind: string, parentId: number | null) {
  if (!enabled || kind !== "review" || parentId !== null) return {};
  const clean = { ...draft };
  if (draft.participation !== "joined") {
    clean.rating_overall = null;
    for (const { key } of REVIEW_ITEMS) if (key !== "apply") clean[`rating_${key}`] = null;
    clean.again = null;
  }
  return clean;
}
export function validateReview(draft: ReviewDraft, rounds: ReviewRound[]): string | null {
  if (!rounds.some((round) => round.id === draft.program_id && round.closed)) return "후기를 남길 회차를 골라 주세요.";
  if (!PARTICIPATION_OPTIONS.some((option) => option.value === draft.participation)) return "참여 여부를 골라 주세요.";
  if (draft.participation === "joined" && draft.rating_overall === null) return "종합 만족도를 별 1~5개로 골라 주세요.";
  const payload = reviewPayload(draft, true, "review", null);
  for (const [key, value] of Object.entries(payload)) {
    if (key.startsWith("rating_") && value !== null && !STAR_VALUES.includes(value as typeof STAR_VALUES[number])) {
      return "별점은 1~5개로 골라 주세요.";
    }
  }
  return null;
}
export function reviewErrorNotice(error: { code: string; message: string }): string | null {
  if (error.code === "23505" && error.message.includes("comments_user_program_review")) return "이 회차에는 이미 후기를 남겼어요";
  const reason = error.message.match(/rating:(\w+)/)?.[1];
  if (!reason) return null;
  const notices: Record<string, string> = {
    participation: "참여 여부를 골라 주세요.", overall: "종합 만족도를 별 1~5개로 골라 주세요.",
    range: "별점은 1~5개로 골라 주세요.", round: "후기를 남길 회차를 골라 주세요.",
    again: "다시 참여할지 보기에서 골라 주세요.",
  };
  return notices[reason] ?? "참여 여부와 별점을 다시 확인해 주세요.";
}

type ItemStats = { [K in ReviewItem as `${K}_avg`]: number | null } & { [K in ReviewItem as `${K}_count`]: number | null };
export interface ReviewSummary extends ItemStats {
  series_id: string;
  program_id: string | null; // null은 묶음 전체
  response_count: number | null;
  rating_count: number | null;
  overall_avg: number | null;
  distribution: number[] | null; // 1점부터 5점까지
  again_rate: number | null; // 선택한 참여자 중 '네' 비율 (0~1)
  again_count: number | null;
}
export const REVIEW_SUMMARY_COLUMNS = "series_id, program_id, response_count, rating_count, overall_avg, distribution, "
  + REVIEW_ITEMS.map(({ key }) => `${key}_avg, ${key}_count`).join(", ") + ", again_rate, again_count";
export const REVIEW_SUMMARY_PAGE_SIZE = 100;
type SummaryPage = (offset: number) => PromiseLike<{ data: unknown; error: unknown }>;
export async function loadReviewSummary(fetchPage: SummaryPage) {
  const rows: ReviewSummary[] = [];
  for (let offset = 0; ; offset += REVIEW_SUMMARY_PAGE_SIZE) {
    let page;
    try { page = await fetchPage(offset); }
    catch { return { available: false, rows: [] as ReviewSummary[] }; }
    // SQL 미적용·권한·통신 오류면 새 칸을 보내지 않고 기존 양식을 쓴다.
    if (page.error) return { available: false, rows: [] as ReviewSummary[] };
    const batch = page.data as ReviewSummary[];
    rows.push(...batch);
    if (batch.length < REVIEW_SUMMARY_PAGE_SIZE) return { available: true, rows };
  }
}

// 관리자 확인에 성공했을 때만 회차 RPC를 호출한다. 확인 실패는 공개 통계에 영향을 주지 않는다.
export async function loadAdminReviewRounds(
  checkAdmin: () => PromiseLike<{ data: unknown; error: unknown }>, fetchPage: SummaryPage,
): Promise<ReviewSummary[] | null> {
  try {
    const { data, error } = await checkAdmin();
    if (error || data !== true) return null;
    return (await loadReviewSummary(fetchPage)).rows;
  } catch { return null; }
}
