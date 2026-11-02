import { useId, useState } from "react";
import { REVIEW_ITEMS, STAR_VALUES } from "../lib/program-reviews.ts";
import type { ReviewRound, ReviewSummary as Summary } from "../lib/program-reviews.ts";

export function ReviewSummary({ rows, rounds }: { rows: Summary[]; rounds: ReviewRound[] }) {
  const [selected, setSelected] = useState("");
  const id = useId();
  const summary = rows.find((row) => row.program_id === (selected || null));
  const ready = summary?.rating_count != null && summary.rating_count >= 3 && summary.overall_avg !== null;
  return <div className="review-summary">
    <label className="review-select" htmlFor={id}>만족도 보기
      <select id={id} value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">묶음 전체 · 모든 회차 합계</option>
        {rounds.map((round) => <option key={round.id} value={round.id}>{round.title} · 이 회차</option>)}
      </select>
    </label>
    <p className="card-sub">{selected ? "고른 회차의 만족도" : "묶음 전체의 만족도"} · 참여했다고 답한 분의 별점이에요.</p>
    {!selected && <p className="card-sub">같은 분도 회차가 다르면 한 번씩 세어요.</p>}
    {!ready ? <p className="comment-empty">후기가 3개 이상 모이면 만족도를 보여 드려요</p> : <>
      <p className="review-overall">만족도 <span className="review-star">★</span>{summary.overall_avg!.toFixed(1)} ({summary.rating_count}명)</p>
      <ul className="review-distribution" aria-label="종합 만족도 분포">
        {[...STAR_VALUES].reverse().map((score) => {
          const count = summary.distribution?.[score - 1] ?? 0;
          return <li key={score}>
            <span>{score}점</span><span className="review-bar" aria-hidden="true"><i style={{ width: `${count / summary.rating_count! * 100}%` }} /></span><span>{count}명</span>
          </li>;
        })}
      </ul>
      <dl className="review-item-stats">
        {REVIEW_ITEMS.map(({ key, label }) => <div key={key}>
          <dt>{label}</dt><dd>{summary[`${key}_avg`] === null ? "아직 응답 없음" : `${summary[`${key}_avg`]!.toFixed(1)}점 (${summary[`${key}_count`]}명)`}</dd>
        </div>)}
      </dl>
      <p className="card-sub">신청 과정에는 선정되지 않았거나 참여하지 못한 분의 답도 포함돼요.</p>
      {summary.again_rate !== null && <p className="card-sub">다시 참여하고 싶어요 {Math.round(summary.again_rate * 100)}% (답한 분 {summary.again_count}명)</p>}
    </>}
  </div>;
}
