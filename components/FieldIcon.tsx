// 분야별 둘러보기 아이콘. 분야 이름(config/tag-categories.json의 field 태그)에 맞는 선 아이콘, 없으면 기본 꼬리표 모양
const PATHS: Record<string, string[]> = {
  "취업·채용": ["M4 8.5h16v10.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z", "M9 8.5V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2.5", "M4 13h16"],
  창업: ["M9 18h6", "M10 21h4", "M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"],
  "장학·지원금": ["M12 21a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z", "M14.5 9.5c-.4-.9-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2.1-.6-2.5-1.5", "M12 6.5v1.5M12 16v1.5"],
  "해외·글로벌": ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M3 12h18", "M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"],
  봉사: ["M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"],
  "상담·심리": ["M20 11.5a7.5 7.5 0 0 1-11.2 6.5L4 19.5l1.5-4.3A7.5 7.5 0 1 1 20 11.5z", "M9 11.5h.01M12.5 11.5h.01M16 11.5h.01"],
  "학사·행정": ["M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z", "M14 3.5V8h4", "M10 12.5h5M10 16h5"],
};
const DEFAULT = ["M4 12.6V5a1 1 0 0 1 1-1h7.6l7 7-8.6 8.6z", "M8.5 8.5h.01"];

export function FieldIcon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(PATHS[name] ?? DEFAULT).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
