"use client";

import { useUser } from "../lib/user.tsx";
import { StarIcon } from "./Icons.tsx";

export function FavoriteButton({ programId, withLabel = false }: { programId: string; withLabel?: boolean }) {
  const { favorites, toggleFavorite } = useUser();
  const on = favorites.has(programId);

  return (
    <button
      className={`favorite ${on ? "on" : ""} ${withLabel ? "with-label" : ""}`}
      aria-pressed={on}
      aria-label={on ? "관심 해제" : "관심 표시"}
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
