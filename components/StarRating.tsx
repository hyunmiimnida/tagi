import { useId, useState } from "react";
import { STAR_VALUES } from "../lib/program-reviews.ts";
import { PixelSprite } from "./PixelPal.tsx";
import { BurstEffect } from "./PixelEffect.tsx";

const STAR = [
  ".....G.....",
  "....GEG....",
  "....GYG....",
  "GGGGGYGGGGG",
  "GEEYYYYYYYG",
  ".GYYYYYYYG.",
  "..GYYYYYG..",
  "..GYYYYYG..",
  ".GYYYGYYYG.",
  ".GYYG.GYYG.",
  ".GGG...GGG.",
];

export function PixelStar({ filled = true }: { filled?: boolean }) {
  return <span className={`review-star${filled ? "" : " empty"}`} aria-hidden="true">
    <PixelSprite rows={STAR} scale={2} />
  </span>;
}

interface Props { label: string; value: number | null; onChange: (value: number | null) => void; required?: boolean }

// 기본 라디오의 Tab·방향키 동작과 화면 낭독기 안내를 그대로 쓴다.
export function StarRating({ label, value, onChange, required = false }: Props) {
  const name = useId();
  const [burst, setBurst] = useState<{ score: number; id: number } | null>(null);
  return <fieldset className="review-rating">
    <legend>{label} ({required ? "필수" : "선택"})</legend>
    <div className="review-stars">
      {STAR_VALUES.map((score) => <label key={score}>
        <input type="radio" name={name} value={score} checked={value === score} required={required}
          onChange={() => {
            onChange(score);
            if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
              setBurst((previous) => ({ score, id: (previous?.id ?? 0) + 1 }));
            } else setBurst(null);
          }} />
        <PixelStar filled={value !== null && score <= value} />
        {burst?.score === score && <span key={burst.id} className="review-star-burst" aria-hidden="true">
          <BurstEffect effect="sparkle" scale={2} />
        </span>}
        <span className="sr-only">{score}점</span>
      </label>)}
      <span className="review-score" aria-hidden="true">{value === null ? "고르지 않음" : `${value}점`}</span>
      {!required && value !== null && <button className="text-button" type="button" onClick={() => { onChange(null); setBurst(null); }}>선택 지우기</button>}
    </div>
  </fieldset>;
}
