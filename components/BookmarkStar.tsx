import { PixelSprite } from "./PixelPal.tsx";

// 관심 표시 별 (도트, 11×11): 꺼진 별은 회색 테두리만, 켜진 별은 금색 별에 왼쪽 위 하이라이트·오른쪽 아래 그림자.
// 막 켜질 때(pop)는 한 순간 둘레에 반짝이를 보여 준다 (app/globals.css의 .bookmark-star)
const ON = [".....G.....", "....GYG....", "....GYG....", "GGGGEYFGGGG", "GEEEYYYYYFG", ".GEYYYYYFG.", "..GEYGFFG..", "..GEG.GFG..", ".GEYG.GFFG.", ".GEG...GFG.", ".GG.....GG."];
const OFF = [".....m.....", "....m.m....", "....m.m....", "mmmm...mmmm", "m.........m", ".m.......m.", "..m..m..m..", "..m.m.m.m..", ".m..m.m..m.", ".m.m...m.m.", ".mm.....mm."];
const POP = ["W...........W", "......G......", ".....GYG.....", ".....GYG.....", ".GGGGEYFGGGG.", ".GEEEYYYYYFG.", "..GEYYYYYFG..", "...GEYGFFG...", "...GEG.GFG...", "..GEYG.GFFG..", "..GEG...GFG..", "..GG.....GG..", "W...........W"];

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
