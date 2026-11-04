import type { Digest } from "../src/types.ts";

// 상세 화면의 항목별 요약 카드 (AI가 원문을 자기 말로 짧게 정리한 것, src/ai.ts의 DIGEST_RULE).
// 내용이 있는 항목만 보여 준다. 요약이 없는 공고는 이 카드를 그리지 않는다
const SECTIONS: [keyof Omit<Digest, "about" | "chips">, string][] = [
  ["activities", "이런 걸 해요"],
  ["eligibility", "이런 분이 지원할 수 있어요"],
  ["benefits", "받을 수 있는 것"],
  ["howToApply", "신청 방법"],
];

export function ProgramDigest({ digest }: { digest: Digest }) {
  const sections = SECTIONS.filter(([key]) => digest[key].length > 0);
  return (
    <section className="card digest-card" aria-label="공고 요약">
      {digest.chips.length > 0 && (
        <ul className="digest-chips">
          {digest.chips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      )}
      {digest.about && (
        <div className="digest-section">
          <h2>어떤 프로그램인가요</h2>
          <p>{digest.about}</p>
        </div>
      )}
      {sections.map(([key, title]) => (
        <div key={key} className="digest-section">
          <h2>{title}</h2>
          <ul>
            {digest[key].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="digest-note">AI가 원문을 짧게 정리했어요. 정확한 내용은 원문에서 확인해 주세요.</p>
    </section>
  );
}
