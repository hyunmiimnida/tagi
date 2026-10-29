import { BUBBLE_WIDTH, PAL_HEIGHT, PAL_WIDTH, palPaths, palRows, withBubble } from "../lib/pixel-pals.ts";
import type { Avatar, PalBubble, PalName, PalPose } from "../lib/pixel-pals.ts";

// 도트 캐릭터 한 명 (lib/pixel-pals.ts). 장식이라 화면 읽기 프로그램은 건너뛰고 눌리지도 않는다.
// 숨 쉬듯 1픽셀 들썩이고 가끔 눈을 깜빡인다 (기기의 "동작 줄이기"를 켜면 멈춘다, app/globals.css의 .pal)
// who: 기본 캐릭터 이름이나 꾸민 캐릭터 모습 (내 캐릭터는 components/MyPal.tsx). scale: 도트 한 칸의 크기(px). delay: 여러 명이 동시에 깜빡이지 않게 시작을 늦춘다(초). bubble: 머리 옆 말풍선(?·!)

interface Props {
  who: PalName | Avatar;
  pose: PalPose;
  scale?: number;
  delay?: number;
  bubble?: PalBubble;
  className?: string;
}

const draw = (rows: string[]) =>
  palPaths(rows).map(({ color, d }) => <path key={color} d={d} fill={`var(--px-${color})`} />);

export function PixelPal({ who, pose, scale = 2, delay = 0, bubble, className = "" }: Props) {
  const height = PAL_HEIGHT[pose];
  const width = PAL_WIDTH + (bubble ? BUBBLE_WIDTH : 0);
  const rows = (blink: boolean) => (bubble ? withBubble(palRows(who, pose, blink), bubble) : palRows(who, pose, blink));
  return (
    <svg
      className={`pal pal-${pose} ${bubble ? "pal-bubble" : ""} ${className}`}
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      data-pal={typeof who === "string" ? who : "me"}
      style={{ "--pal-scale": `${scale}px`, "--pal-delay": `${delay}s` } as React.CSSProperties}
    >
      <g className="pal-open">{draw(rows(false))}</g>
      <g className="pal-closed">{draw(rows(true))}</g>
    </svg>
  );
}

// 카드를 벽 삼아 고개를 빼꼼 내민 캐릭터. 카드 바로 앞에 두면 두 손이 카드 윗선에 걸친다.
// right: 카드 오른쪽 끝에서 얼마나 떨어질지(px)
// searching: 돋보기를 들고 좌우로 두리번거린다 (공고 화면에서 검색어를 치는 동안)
export function PeekPal({ who, right = 28, delay = 0, searching = false }: { who: PalName | Avatar; right?: number; delay?: number; searching?: boolean }) {
  return (
    <div className={`pal-peek-anchor ${searching ? "searching" : ""}`} aria-hidden="true" style={{ "--pal-right": `${right}px` } as React.CSSProperties}>
      <PixelPal who={who} pose="peek" scale={2} delay={delay} />
      {searching && (
        <span className="pal-magnifier">
          <PixelSprite rows={MAGNIFIER} scale={2} />
        </span>
      )}
    </div>
  );
}

// 돋보기 (7×7)
const MAGNIFIER = [".KKK...", "KIWIK..", "KIIIK..", "KIIIK..", ".KKKt..", "....tt.", ".....tt"];

// 동작 그림·효과 그림처럼 깜빡임 없이 한 장만 그리는 도트 그림 (components/StarHelper.tsx)
export function PixelSprite({ rows, scale }: { rows: string[]; scale: number }) {
  return (
    <svg
      className="pal"
      width={rows[0].length * scale}
      height={rows.length * scale}
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {draw(rows)}
    </svg>
  );
}
