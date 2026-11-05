import { PixelSprite } from "./PixelPal.tsx";

// 관심 표시 별 (도트, Codex가 그림): 꺼진 별은 회색 테두리만, 켜진 별은 금색 별에 하이라이트.
// 막 켜질 때(pop)는 한 순간 조금 큰 별과 반짝이를 보여 준다 (app/globals.css의 .bookmark-star)
const ON = [".....G.....", "....GYG....", "....GEG....", ".GGGYYYGGG.", "GYYYYYYYYYG", ".GGYYYYYGG.", "...GYYYG...", "...GYYYG...", "..GYYGYYG..", "..GYG.GYG..", "..GG...GG.."];
const OFF = [".....m.....", "....m.m....", "....m.m....", ".mmm...mmm.", "m.........m", ".mm.....mm.", "...m...m...", "...m...m...", "..m..m..m..", "..m.m.m.m..", "..mm...mm.."];
const POP = ["......G......", ".W...GYG...W.", ".....GEG.....", "....GYYYG....", ".GGGYYYYYGGG.", "GYYYYYYYYYYYG", ".GGYYYYYYYGG.", "...GYYYYYG...", "....GYYYG....", "...GYYGYYG...", "W..GYYGYYG..W", "..GYYG.GYYG..", "..GGG...GGG.."];

export function BookmarkStar({ on, pop = false, scale = 2 }: { on: boolean; pop?: boolean; scale?: number }) {
  return (
    <span className={`bookmark-star ${pop && on ? "pop" : ""}`} aria-hidden="true">
      <PixelSprite rows={on ? ON : OFF} scale={scale} />
      {pop && on && (
        <span className="bookmark-star-pop">
          <PixelSprite rows={POP} scale={scale} />
        </span>
      )}
    </span>
  );
}
