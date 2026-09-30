"use client";

import { useUser } from "../lib/user.tsx";

export function FavoriteButton({ programId, withLabel = false }: { programId: string; withLabel?: boolean }) {
  const { favorites, toggleFavorite } = useUser();
  const on = favorites.has(programId);

  return (
    <button
      className={`favorite ${on ? "on" : ""}`}
      aria-pressed={on}
      aria-label={on ? "관심 해제" : "관심 표시"}
      onClick={(event) => {
        event.preventDefault();
        toggleFavorite(programId);
      }}
    >
      {on ? "★" : "☆"}
      {withLabel && (on ? " 관심 표시됨" : " 관심 표시")}
    </button>
  );
}
