import assert from "node:assert/strict";
import test from "node:test";
import { emptyReview, loadReviewSummary, REVIEW_ITEMS, REVIEW_SUMMARY_PAGE_SIZE, reviewErrorNotice, reviewPayload, reviewRoundsForToday, validateReview, writableReviewRounds } from "./program-reviews.ts";
import type { ReviewSummary } from "./program-reviews.ts";

const rounds = [{ id: "current", title: "이번 회차", closed: true }, { id: "past", title: "지난 회차", closed: true }];
test("모집 마감된 이번 공고가 먼저, 모집 중이면 지난 회차가 먼저다", () => {
  assert.equal(writableReviewRounds(rounds)[0].id, "current");
  assert.equal(writableReviewRounds([{ ...rounds[0], closed: false }, rounds[1]])[0].id, "past");
  assert.deepEqual(writableReviewRounds([{ ...rounds[0], closed: false }]), []);
});

test("미리 만든 화면도 모집 마감 다음 날부터 후기를 쓸 수 있다", () => {
  const rounds = [{ id: "current", title: "이번 회차", closed: false, recruitEnd: "2026-11-02" }];
  assert.deepEqual(writableReviewRounds(reviewRoundsForToday(rounds, "2026-11-02")), []);
  assert.equal(writableReviewRounds(reviewRoundsForToday(rounds, "2026-11-03"))[0].id, "current");
  assert.equal(reviewRoundsForToday(rounds, "")[0].closed, false);
});

test("후기 참여 여부와 참여자 종합 별점은 필수, 세부 별점은 선택이다", () => {
  const draft = emptyReview("current");
  assert.match(validateReview(draft, rounds)!, /참여 여부/);
  assert.match(validateReview({ ...draft, participation: "joined" }, rounds)!, /종합 만족도/);
  assert.equal(validateReview({ ...draft, participation: "joined", rating_overall: 1 }, rounds), null);
  for (const participation of ["not_selected", "dropped"] as const) {
    assert.equal(validateReview({ ...draft, participation }, rounds), null);
  }
  assert.match(validateReview({ ...draft, participation: "joined", rating_overall: 6 }, rounds)!, /1~5/);
  assert.match(validateReview({ ...draft, participation: "joined", rating_overall: 1.5 }, rounds)!, /1~5/);
  for (const { key } of REVIEW_ITEMS) {
    assert.match(validateReview({ ...draft, participation: "joined", rating_overall: 5, [`rating_${key}`]: 0 }, rounds)!, /1~5/);
  }
  assert.match(validateReview({ ...draft, program_id: "unknown" }, rounds)!, /회차/);
  assert.match(validateReview(draft, [{ ...rounds[0], closed: false }])!, /회차/);
});

test("미선정·미참여는 신청 과정만 저장하고, 숨겨진 입력값은 보내지 않는다", () => {
  for (const participation of ["not_selected", "dropped"] as const) {
    const draft = { ...emptyReview("current"), participation, rating_overall: 5, rating_content: 5,
      rating_apply: 2, rating_operation: 4, rating_schedule: 4, rating_benefit: 4, again: "yes" as const };
    assert.deepEqual(reviewPayload(draft, true, "review", null), {
      ...emptyReview("current"), participation, rating_apply: 2,
    });
  }
});

test("SQL 적용 전·답글·대화 insert에는 새 칸을 하나도 보내지 않는다", () => {
  const draft = { ...emptyReview("current"), participation: "joined" as const, rating_overall: 4 };
  assert.deepEqual(reviewPayload(draft, false, "review", null), {});
  assert.deepEqual(reviewPayload(draft, true, "talk", null), {});
  assert.deepEqual(reviewPayload(draft, true, "review", 3), {});
  assert.deepEqual(reviewPayload(draft, true, "review", null), draft);
});

test("통계 뷰 미적용·권한·통신 오류는 기존 양식으로 돌아간다", async () => {
  for (const code of ["42P01", "PGRST205", "42703", "42501", "network"]) {
    const result = await loadReviewSummary(async () => ({ data: null, error: { code } }));
    assert.equal(result.available, false);
    assert.deepEqual(result.rows, []);
  }
  assert.deepEqual(await loadReviewSummary(async () => ({ data: [], error: null })), { available: true, rows: [] });
  assert.equal((await loadReviewSummary(async () => { throw new Error("network"); })).available, false);
});

test("회차 통계를 끝까지 읽고 중간 페이지 실패도 감지한다", async () => {
  const batch = Array.from({ length: REVIEW_SUMMARY_PAGE_SIZE }, (_, index) => ({ program_id: `round-${index}` } as ReviewSummary));
  const offsets: number[] = [];
  const result = await loadReviewSummary(async (offset) => {
    offsets.push(offset);
    return { data: offset === 0 ? batch : [], error: null };
  });
  assert.deepEqual(offsets, [0, REVIEW_SUMMARY_PAGE_SIZE]);
  assert.equal(result.rows.length, REVIEW_SUMMARY_PAGE_SIZE);
  assert.equal((await loadReviewSummary(async (offset) => offset === 0
    ? { data: batch, error: null } : { data: null, error: { code: "network" } })).available, false);
});

test("서버 필수값·범위·중복 오류는 쉬운 안내로 바꾼다", () => {
  assert.equal(reviewErrorNotice({ code: "23505", message: 'duplicate key violates unique constraint "comments_user_program_review"' }), "이 회차에는 이미 후기를 남겼어요");
  assert.match(reviewErrorNotice({ code: "P0001", message: "rating:overall" })!, /종합 만족도/);
  assert.match(reviewErrorNotice({ code: "P0001", message: "rating:participation" })!, /참여 여부/);
  assert.match(reviewErrorNotice({ code: "P0001", message: "rating:range" })!, /1~5/);
  assert.equal(reviewErrorNotice({ code: "23505", message: "other_constraint" }), null);
  assert.equal(reviewErrorNotice({ code: "P0001", message: "spam:daily" }), null);
});
