import { useId } from "react";
import { AGAIN_OPTIONS, PARTICIPATION_OPTIONS, REVIEW_ITEMS } from "../lib/program-reviews.ts";
import type { ReviewDraft, ReviewRound } from "../lib/program-reviews.ts";
import { StarRating } from "./StarRating.tsx";

interface Props { draft: ReviewDraft; rounds: ReviewRound[]; onChange: (draft: ReviewDraft) => void; disabled: boolean }

export function ReviewFields({ draft, rounds, onChange, disabled }: Props) {
  const name = useId();
  const joined = draft.participation === "joined";
  return <fieldset className="review-fields" disabled={disabled}>
    <legend className="sr-only">후기 참여 정보와 만족도</legend>
    <label className="review-select">어느 회차인가요 (필수)
      <select value={draft.program_id} required onChange={(event) => onChange({ ...draft, program_id: event.target.value })}>
        {rounds.map((round) => <option key={round.id} value={round.id}>{round.title}</option>)}
      </select>
    </label>
    <fieldset className="review-options">
      <legend>참여 여부 (필수)</legend>
      {PARTICIPATION_OPTIONS.map((option) => <label key={option.value}>
        <input type="radio" name={`${name}-participation`} required checked={draft.participation === option.value}
          onChange={() => onChange({ ...draft, participation: option.value })} />{option.label}
      </label>)}
    </fieldset>
    {joined && <StarRating label="종합 만족도" value={draft.rating_overall} required
      onChange={(rating_overall) => onChange({ ...draft, rating_overall })} />}
    {draft.participation && REVIEW_ITEMS.filter(({ key }) => joined || key === "apply").map(({ key, label }) =>
      <StarRating key={key} label={label} value={draft[`rating_${key}`]}
        onChange={(value) => onChange({ ...draft, [`rating_${key}`]: value })} />)}
    {joined && <label className="review-select">다시 참여할 건가요 (선택)
      <select value={draft.again ?? ""} onChange={(event) => onChange({ ...draft, again: event.target.value as ReviewDraft["again"] || null })}>
        <option value="">고르지 않음</option>
        {AGAIN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>}
  </fieldset>;
}
