import { useId } from "react";
import { STAR_VALUES } from "../lib/program-reviews.ts";

interface Props { label: string; value: number | null; onChange: (value: number | null) => void; required?: boolean }

// 기본 라디오의 Tab·방향키 동작과 화면 낭독기 안내를 그대로 쓴다.
export function StarRating({ label, value, onChange, required = false }: Props) {
  const name = useId();
  return <fieldset className="review-rating">
    <legend>{label} ({required ? "필수" : "선택"})</legend>
    <div className="review-stars">
      {STAR_VALUES.map((score) => <label key={score}>
        <input type="radio" name={name} value={score} checked={value === score} required={required}
          onChange={() => onChange(score)} />
        <span className={value !== null && score <= value ? "filled" : ""} aria-hidden="true">★</span>
        <span className="sr-only">{score}점</span>
      </label>)}
      <span className="review-score" aria-hidden="true">{value === null ? "고르지 않음" : `${value}점`}</span>
      {!required && value !== null && <button className="text-button" type="button" onClick={() => onChange(null)}>선택 지우기</button>}
    </div>
  </fieldset>;
}
