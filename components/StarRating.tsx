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

const POP_STEP_MS = 70; // 고른 별까지 왼쪽부터 차례로 튀어 오르는 간격 (app/globals.css의 .review-star.pop)

// popDelay가 있으면 그만큼 기다렸다가 한 번 튀어 오른다
export function PixelStar({ filled = true, scale = 2, popDelay }: { filled?: boolean; scale?: number; popDelay?: number }) {
  return <span className={`review-star${filled ? "" : " empty"}${popDelay === undefined ? "" : " pop"}`} aria-hidden="true"
    style={popDelay === undefined ? undefined : { "--pop-delay": `${popDelay}ms` } as React.CSSProperties}>
    <PixelSprite rows={STAR} scale={scale} />
  </span>;
}

interface Props { label: string; value: number | null; onChange: (value: number | null) => void; required?: boolean }

// 기본 라디오의 Tab·방향키 동작과 화면 낭독기 안내를 그대로 쓴다.
// 고르면 1점부터 고른 별까지 차례로 튀어 오르고, 고른 별에서 반짝이와 도트 조각이 터진다(5점은 더 크게)
export function StarRating({ label, value, onChange, required = false }: Props) {
  const name = useId();
  const [burst, setBurst] = useState<{ score: number; id: number } | null>(null);
  const top = burst?.score === STAR_VALUES[STAR_VALUES.length - 1];
  return <fieldset className="review-rating">
    <legend>{label} ({required ? "필수" : "선택"})</legend>
    <div className="review-stars">
      {STAR_VALUES.map((score) => {
        const popping = burst !== null && score <= burst.score;
        return <label key={score}>
          <input type="radio" name={name} value={score} checked={value === score} required={required}
            onChange={() => {
              onChange(score);
              if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                setBurst((previous) => ({ score, id: (previous?.id ?? 0) + 1 }));
              } else setBurst(null);
            }} />
          <PixelStar key={popping ? `pop-${burst?.id}` : "still"} filled={value !== null && score <= value} scale={3}
            popDelay={popping ? (score - 1) * POP_STEP_MS : undefined} />
          {burst?.score === score && <span key={burst.id} className={`review-star-burst${top ? " top" : ""}`} aria-hidden="true"
            style={{ "--burst-delay": `${(score - 1) * POP_STEP_MS}ms` } as React.CSSProperties}>
            <BurstEffect effect="sparkle" scale={top ? 5 : 4} />
            {Array.from({ length: top ? 12 : 8 }, (_, i) => (
              <i key={i} style={{ "--a": `${(360 / (top ? 12 : 8)) * i}deg` } as React.CSSProperties} />
            ))}
          </span>}
          <span className="sr-only">{score}점</span>
        </label>;
      })}
      <span key={burst?.id ?? 0} className={`review-score${burst ? " pop" : ""}`} aria-hidden="true">{value === null ? "고르지 않음" : `${value}점`}</span>
      {!required && value !== null && <button className="text-button" type="button" onClick={() => { onChange(null); setBurst(null); }}>선택 지우기</button>}
    </div>
  </fieldset>;
}
