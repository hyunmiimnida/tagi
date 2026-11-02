import { useId, useState } from "react";
import { REVIEW_ITEMS, STAR_VALUES } from "../lib/program-reviews.ts";
import type { ReviewRound, ReviewSummary as Summary } from "../lib/program-reviews.ts";
import { PixelStar } from "./StarRating.tsx";

interface Props { rows: Summary[]; roundRows: Summary[]; rounds: ReviewRound[]; isAdmin: boolean }

export function ReviewSummary({ rows, roundRows, rounds, isAdmin }: Props) {
  const [selected, setSelected] = useState("");
  const id = useId();
  const round = isAdmin ? selected : "";
  const summary = round ? roundRows.find((row) => row.program_id === round) : rows.find((row) => row.program_id === null);
  const ready = summary && (summary.overall_avg !== null || REVIEW_ITEMS.some(({ key }) => summary[`${key}_avg`] !== null));
  return <>
    {isAdmin && <label className="review-select" htmlFor={id}>만족도 보기
      <select id={id} value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">모든 회차 통합 만족도</option>
        {rounds.map((round) => <option key={round.id} value={round.id}>{round.title} · 이 회차</option>)}
      </select>
    </label>}
    {ready && <div className="review-summary">
      <h3 className="review-summary-title">{round ? "회차 만족도" : "모든 회차 통합 만족도"}</h3>
      {summary.overall_avg !== null && <p className="review-overall">만족도 <PixelStar />{summary.overall_avg.toFixed(1)} ({summary.rating_count}명)</p>}
      {Boolean(summary.rating_count) &&
      <ul className="review-distribution" aria-label="종합 만족도 분포">
        {[...STAR_VALUES].reverse().map((score) => {
          const count = summary.distribution?.[score - 1] ?? 0;
          return <li key={score}>
            <span>{score}점</span><span className="review-bar" aria-hidden="true"><i style={{ width: `${count / summary.rating_count! * 100}%` }} /></span><span>{count}명</span>
          </li>;
        })}
      </ul>}
      <dl className="review-item-stats">
        {REVIEW_ITEMS.map(({ key, label }) => <div key={key}>
          <dt>{label}</dt><dd>{summary[`${key}_avg`] === null ? "아직 응답 없음" : `${summary[`${key}_avg`]!.toFixed(1)}점 (${summary[`${key}_count`]}명)`}</dd>
        </div>)}
      </dl>
      {summary.again_rate !== null && <p className="card-sub">다시 참여하고 싶어요 {Math.round(summary.again_rate * 100)}% (답한 분 {summary.again_count}명)</p>}
    </div>}
  </>;
}
