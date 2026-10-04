"use client";

import { useEffect, useState } from "react";
import { useUser } from "../lib/user.tsx";
import { StarIcon } from "./Icons.tsx";
import { requestStarHelper } from "./StarHelper.tsx";

const SPARKS = 8; // 별이 켜질 때 퍼지는 도트 반짝이 수

// title: 화면 읽기 프로그램이 어느 공고의 버튼인지 알 수 있게 버튼 이름에 넣는다.
// 관심 표시를 켜면 도트 캐릭터가 와서 별을 눌러 준다(components/StarHelper.tsx): 그동안 별은 잠깐 비어 있다가,
// 캐릭터가 누르는 순간 노랗게 바뀌며 반짝인다. 관심 표시 자체(저장)는 누르자마자 된다
export function FavoriteButton({ programId, title, withLabel = false }: { programId: string; title: string; withLabel?: boolean }) {
  const { favorites, toggleFavorite, loginEnabled, signedIn } = useUser();
  const [waiting, setWaiting] = useState(false); // 캐릭터가 오는 중
  const [burst, setBurst] = useState(0); // 반짝임을 다시 그리는 번호
  const on = favorites.has(programId);
  const lit = on && !waiting;

  // 캐릭터가 못 오는 일이 생겨도 별은 곧 켠다
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaiting(false), 2000);
    return () => clearTimeout(timer);
  }, [waiting]);

  return (
    <button
      className={`favorite ${lit ? "on" : ""} ${withLabel ? "with-label" : ""}`}
      aria-pressed={on}
      aria-label={`${title} ${on ? "관심 해제" : "관심 표시"}`}
      onClick={(event) => {
        event.preventDefault();
        // 로그인이 필요하면(로그인 창이 열림) 캐릭터는 오지 않는다
        if (!on && (!loginEnabled || signedIn)) {
          const coming = requestStarHelper(event.currentTarget, () => {
            setWaiting(false);
            setBurst((n) => n + 1);
          });
          if (coming) setWaiting(true);
          else setBurst((n) => n + 1);
        }
        toggleFavorite(programId);
      }}
    >
      <span key={burst} className={`favorite-icon ${burst > 0 && lit ? "star-pop" : ""}`}>
        <StarIcon filled={lit} />
        {burst > 0 && lit && (
          <span className="star-burst" aria-hidden="true">
            {Array.from({ length: SPARKS }, (_, i) => (
              <i key={i} style={{ "--a": `${(360 / SPARKS) * i}deg` } as React.CSSProperties} />
            ))}
          </span>
        )}
      </span>
      {withLabel && <span>{on ? "관심 공고" : "관심 표시"}</span>}
    </button>
  );
}
