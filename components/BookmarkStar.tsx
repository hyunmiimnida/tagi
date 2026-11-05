// 관심 표시 별: 꼭짓점을 둥글게 다듬은 별. 꺼지면 회색 테두리, 켜지면 노란 별에 금색 테두리 (색은 app/globals.css의 --star-*)
// 켜지는 순간의 튀어 오름·반짝이는 components/FavoriteButton.tsx의 star-pop·star-burst
const POINTS = "12,3 14.7,8.88 21.13,9.63 16.37,14.02 17.64,20.37 12,17.2 6.36,20.37 7.63,14.02 2.87,9.63 9.3,8.88";

export function BookmarkStar({ on, size = 22 }: { on: boolean; size?: number }) {
  return (
    <svg className={`bookmark-star ${on ? "on" : ""}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <polygon points={POINTS} strokeWidth={2.2} strokeLinejoin="round" />
    </svg>
  );
}
