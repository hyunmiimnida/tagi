"use client";

import { useUser } from "../lib/user.tsx";
import { StarIcon } from "./Icons.tsx";

// title: 화면 읽기 프로그램이 어느 공고의 버튼인지 알 수 있게 버튼 이름에 넣는다
export function FavoriteButton({ programId, title, withLabel = false }: { programId: string; title: string; withLabel?: boolean }) {
  const { favorites, toggleFavorite } = useUser();
  const on = favorites.has(programId);

  return (
    <button
      className={`favorite ${on ? "on" : ""} ${withLabel ? "with-label" : ""}`}
      aria-pressed={on}
      aria-label={`${title} ${on ? "관심 해제" : "관심 표시"}`}
      onClick={(event) => {
        event.preventDefault();
        toggleFavorite(programId);
      }}
    >
      <StarIcon filled={on} />
      {withLabel && <span>{on ? "관심 공고" : "관심 표시"}</span>}
    </button>
  );
}
