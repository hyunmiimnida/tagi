"use client";

import { useEffect, useState } from "react";
import { palPaths } from "../lib/pixel-pals.ts";
import { EFFECTS } from "../lib/pixel-effects.ts";
import type { EffectId } from "../lib/pixel-effects.ts";

// 도트 이펙트 (lib/pixel-effects.ts). 프레임을 겹쳐 그려 두고 CSS가 차례로 하나씩 보여 준다 (app/globals.css의 .pfx)
//   once: 한 번 재생하고 사라짐 (별이 켜질 때 터지는 burst)
//   loop: 계속 돌기 (캐릭터 주변을 떠다니는 ambient. 4프레임)
// 장식이라 화면 읽기 프로그램은 건너뛰고 눌리지도 않는다

export function PixelFrames({ frames, scale, frameMs, loop = false }: { frames: string[][]; scale: number; frameMs: number; loop?: boolean }) {
  const width = frames[0][0].length;
  const height = frames[0].length;
  return (
    <svg
      className={`pfx ${loop ? "pfx-loop" : "pfx-once"}`}
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      style={{ "--pfx-ms": `${frameMs}ms`, "--pfx-n": frames.length } as React.CSSProperties}
    >
      {frames.map((rows, i) => (
        <g key={i} style={{ "--i": i } as React.CSSProperties}>
          {palPaths(rows).map(({ color, d }) => (
            <path key={color} d={d} fill={`var(--px-${color})`} />
          ))}
        </g>
      ))}
    </svg>
  );
}

// 별 위치에서 한 번 터지는 이펙트. 기준점이 이펙트의 가운데
export function BurstEffect({ effect, scale = 2 }: { effect: EffectId; scale?: number }) {
  return <PixelFrames frames={EFFECTS[effect].burst} scale={scale} frameMs={75} />;
}

const AMBIENT_EVERY_MS = 3200; // 입자가 새로 나오는 간격
const AMBIENT_LIFE_MS = 2200; // 입자 하나가 떠다니는 시간 (app/globals.css의 .amb 애니메이션과 같게)

// 캐릭터 주변을 가끔 떠다니는 작은 입자. 기기의 "동작 줄이기"를 켜면 나오지 않는다
export function AmbientEffect({ effect }: { effect: EffectId }) {
  const [particles, setParticles] = useState<{ id: number; dx: number }[]>([]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let id = 0;
    const spawn = () => {
      const particle = { id: ++id, dx: Math.round(Math.random() * 28 - 14) };
      setParticles((list) => [...list, particle]);
      setTimeout(() => setParticles((list) => list.filter((p) => p.id !== particle.id)), AMBIENT_LIFE_MS);
    };
    const first = setTimeout(spawn, 600);
    const timer = setInterval(spawn, AMBIENT_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [effect]);
  const { ambient, motion } = EFFECTS[effect];
  return (
    <span className="amb-anchor" aria-hidden="true">
      {particles.map((p) => (
        <span key={p.id} className={`amb amb-${motion}`} style={{ "--dx": `${p.dx}px` } as React.CSSProperties}>
          <PixelFrames frames={ambient} scale={2} frameMs={160} loop />
        </span>
      ))}
    </span>
  );
}
