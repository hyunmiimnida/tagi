// 빈 화면 그림: 돋보기와 공고 카드. 색은 globals.css 변수를 써서 다크 모드에도 맞는다
export function EmptyArt() {
  return (
    <svg className="empty-art" width="120" height="96" viewBox="0 0 120 96" fill="none" aria-hidden="true">
      <rect x="14" y="14" width="64" height="72" rx="10" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="2" />
      <rect x="24" y="28" width="36" height="6" rx="3" fill="var(--line)" />
      <rect x="24" y="42" width="44" height="5" rx="2.5" fill="var(--line)" />
      <rect x="24" y="54" width="28" height="5" rx="2.5" fill="var(--line)" />
      <rect x="24" y="66" width="18" height="8" rx="4" fill="var(--accent-soft)" />
      <circle cx="82" cy="50" r="17" fill="var(--surface)" stroke="var(--accent)" strokeWidth="5" />
      <path d="M94 62 108 76" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" />
      <path d="M76 45c1.5-2.5 4-4 7-4" stroke="var(--accent-soft)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
