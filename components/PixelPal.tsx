import { BUBBLE_WIDTH, PAL_HEIGHT, PAL_WIDTH, palPaths, palRows, withBubble } from "../lib/pixel-pals.ts";
import type { PalBubble, PalName, PalPose } from "../lib/pixel-pals.ts";

// 도트 캐릭터 한 명 (lib/pixel-pals.ts). 장식이라 화면 읽기 프로그램은 건너뛰고 눌리지도 않는다.
// 숨 쉬듯 1픽셀 들썩이고 가끔 눈을 깜빡인다 (기기의 "동작 줄이기"를 켜면 멈춘다, app/globals.css의 .pal)
// scale: 도트 한 칸의 크기(px). delay: 여러 명이 동시에 깜빡이지 않게 시작을 늦춘다(초). bubble: 머리 옆 말풍선(?·!)

interface Props {
  name: PalName;
  pose: PalPose;
  scale?: number;
  delay?: number;
  bubble?: PalBubble;
  className?: string;
}

const draw = (rows: string[]) =>
  palPaths(rows).map(({ color, d }) => <path key={color} d={d} fill={`var(--px-${color})`} />);

export function PixelPal({ name, pose, scale = 2, delay = 0, bubble, className = "" }: Props) {
  const height = PAL_HEIGHT[pose];
  const width = PAL_WIDTH + (bubble ? BUBBLE_WIDTH : 0);
  const rows = (blink: boolean) => (bubble ? withBubble(palRows(name, pose, blink), bubble) : palRows(name, pose, blink));
  return (
    <svg
      className={`pal pal-${pose} ${bubble ? "pal-bubble" : ""} ${className}`}
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      data-pal={name}
      style={{ "--pal-scale": `${scale}px`, "--pal-delay": `${delay}s` } as React.CSSProperties}
    >
      <g className="pal-open">{draw(rows(false))}</g>
      <g className="pal-closed">{draw(rows(true))}</g>
    </svg>
  );
}

// 카드를 벽 삼아 고개를 빼꼼 내민 캐릭터. 카드 바로 앞에 두면 두 손이 카드 윗선에 걸친다.
// right: 카드 오른쪽 끝에서 얼마나 떨어질지(px)
export function PeekPal({ name, right = 28, delay = 0 }: { name: PalName; right?: number; delay?: number }) {
  return (
    <div className="pal-peek-anchor" aria-hidden="true" style={{ "--pal-right": `${right}px` } as React.CSSProperties}>
      <PixelPal name={name} pose="peek" scale={2} delay={delay} />
    </div>
  );
}
