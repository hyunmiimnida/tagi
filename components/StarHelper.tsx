"use client";

import { useEffect, useRef, useState } from "react";
import { ACTION_HEIGHT, ACTION_WIDTH, EFFECT_ROWS, actionRows } from "../lib/pixel-pals.ts";
import type { ActionFrame, PalName } from "../lib/pixel-pals.ts";
import { PixelSprite } from "./PixelPal.tsx";

// 관심 표시(☆)를 켜면 도트 캐릭터가 직접 별을 켜 준다. 캐릭터마다 동작이 다르다:
//   기사   카드에서 뛰어내려 별까지 달려가 칼을 휘두른다(칼바람) → 뒤돌아 달려서 복귀
//   궁수   그 자리에서 일어나 활을 꺼내 쏜다 → 화살이 별에 꽂힌다 → 다시 숨는다
//   마법사 펑! 사라져 별 옆에 나타나 지팡이로 마법을 건다 → 펑! 사라져 제자리에 나타난다
//   성직자 일어나 지팡이를 들고 기도한다 → 하늘에서 빛기둥이 별에 내려온다 → 다시 숨는다
// 출발하는 캐릭터: 그 카드에서 빼꼼하던 캐릭터(화면에 보일 때), 아니면 아래 탭 바의 캐릭터.
// 별이 켜지는 순간 onTap(components/FavoriteButton.tsx가 별을 노랗게 바꾸고 반짝이를 띄운다).
// 기기의 "동작 줄이기"가 켜져 있거나 이미 한 명이 다녀오는 중이면 캐릭터 없이 바로 별이 켜진다 (false를 돌려준다)

type Start = (button: HTMLElement, onTap: () => void) => boolean;
let start: Start | null = null;

export function requestStarHelper(button: HTMLElement, onTap: () => void): boolean {
  return start ? start(button, onTap) : false;
}

const SCALE = 2;
const W = ACTION_WIDTH * SCALE; // 48
const H = ACTION_HEIGHT * SCALE; // 34
const CENTER = 12 * SCALE; // 그림 왼쪽에서 몸 가운데까지

type Point = { x: number; y: number };
type Fx =
  | { id: number; kind: "slash"; at: Point; flip: boolean }
  | { id: number; kind: "arrow"; from: Point; to: Point }
  | { id: number; kind: "poof"; at: Point }
  | { id: number; kind: "spark"; at: Point; color: string }
  | { id: number; kind: "beam"; at: Point };
type FxInput = Fx extends infer T ? (T extends Fx ? Omit<T, "id"> : never) : never;

interface Actor {
  name: PalName;
  frame: ActionFrame;
  flip: boolean;
  start: Point; // 처음 그릴 자리 (그 뒤 움직임은 애니메이션이 맡는다)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 화면(머리말과 아래 탭 바 사이)에 보이는지
function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 56 && r.top < window.innerHeight - 64;
}

export function StarHelper() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [effects, setEffects] = useState<Fx[]>([]);
  const busy = useRef(false);
  const actorEl = useRef<HTMLDivElement | null>(null);
  const spriteEl = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let fxId = 0;
    const fx = (effect: FxInput, ms = 650) => {
      const id = ++fxId;
      setEffects((list) => [...list, { ...effect, id } as Fx]);
      setTimeout(() => setEffects((list) => list.filter((e) => e.id !== id)), ms);
    };

    start = (button, onTap) => {
      if (busy.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      const wallPal = button.closest(".pal-wall")?.querySelector<SVGElement>(".pal-peek-anchor svg[data-pal]");
      const source = wallPal && onScreen(wallPal) ? wallPal : document.querySelector<SVGElement>(".tab-pal[data-pal]");
      const name = source?.dataset.pal as PalName | undefined;
      if (!source || !name) return false;
      busy.current = true;
      void perform(name, source, button, onTap).finally(() => {
        source.style.visibility = "";
        setActor(null);
        busy.current = false;
      });
      return true;
    };

    async function perform(name: PalName, source: SVGElement, button: HTMLElement, onTap: () => void) {
      let tapped = false;
      const tap = () => {
        if (!tapped) onTap();
        tapped = true;
      };
      try {
        const s = source.getBoundingClientRect();
        const b = button.getBoundingClientRect();
        const home = { cx: s.left + s.width / 2, feet: s.bottom - 4 }; // 카드 윗선(또는 탭 아이콘) 위에 선 자리
        const star = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        // 별 왼쪽에 서서 오른쪽을 본다 (왼쪽 공간이 없으면 반대로)
        const faceLeft = star.x - 30 - CENTER < 4;
        const beside = { cx: faceLeft ? star.x + 30 : star.x - 30, feet: b.bottom - 2 };

        // 캐릭터 그리기 시작: 빼꼼하던 캐릭터를 숨기고 같은 자리에 선 모습으로
        const place = (p: { cx: number; feet: number }): Point => ({ x: p.cx - CENTER, y: p.feet - H });
        let at = place(home);
        source.style.visibility = "hidden";
        setActor({ name, frame: "stand", flip: name === "knight" || name === "wizard" ? faceLeft : star.x < home.cx, start: at });
        // 그려질 때까지 기다린다
        for (let i = 0; i < 20 && !actorEl.current; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
        const el = actorEl.current;
        const sprite = spriteEl.current;
        if (!el || !sprite) return;
        const pos = (p: Point) => `translate(${p.x}px, ${p.y}px)`;
        const frame = (f: ActionFrame, flip?: boolean) => setActor((a) => (a ? { ...a, frame: f, flip: flip ?? a.flip } : a));
        const move = async (to: Point, ms: number, arc = 0) => {
          const mid = { x: (at.x + to.x) / 2, y: Math.min(at.y, to.y) - arc };
          const keys = arc ? [pos(at), pos(mid), pos(to)] : [pos(at), pos(to)];
          await el.animate(keys.map((transform) => ({ transform })), { duration: ms, easing: arc ? "ease-in-out" : "linear", fill: "forwards" }).finished;
          at = to;
          el.style.transform = pos(at);
        };
        const run = async (to: Point, ms: number) => {
          let step = 0;
          const legs = setInterval(() => frame(step++ % 2 ? "runA" : "runB"), 85);
          await move(to, ms);
          clearInterval(legs);
          frame("stand");
        };
        const popUp = () => el.animate([{ transform: `${pos(at)} translateY(10px)`, opacity: 0 }, { transform: pos(at), opacity: 1 }], { duration: 140, easing: "steps(3, end)" }).finished;
        const sinkDown = () => el.animate([{ transform: pos(at), opacity: 1 }, { transform: `${pos(at)} translateY(10px)`, opacity: 0 }], { duration: 140, easing: "steps(3, end)", fill: "forwards" }).finished;
        const teleport = (out: boolean) =>
          sprite.animate(
            [
              { transform: "scale(1, 1)", opacity: 1 },
              { transform: "scale(0.15, 1.7)", opacity: 0 },
            ],
            { duration: 180, easing: "steps(4, end)", fill: "forwards", direction: out ? "normal" : "reverse" },
          ).finished;
        const bodyCenter = (): Point => ({ x: at.x + CENTER, y: at.y + H / 2 });

        if (name === "knight") {
          // 카드에서 뛰어내려 별 가까이 착지 → 달려가서 → 칼을 치켜들었다 휘두르기 → 뒤돌아 달려서 → 뛰어올라 복귀
          const dir = faceLeft ? -1 : 1;
          const landing = place({ cx: Math.min(Math.max(beside.cx - dir * 56, 28), window.innerWidth - 28), feet: beside.feet });
          frame("runB", landing.x + CENTER > home.cx ? false : true);
          await move(landing, 300, 36);
          frame("stand", faceLeft);
          await run(place(beside), 230);
          frame("windup");
          await sleep(130);
          frame("strike");
          fx({ kind: "slash", at: star, flip: faceLeft }, 320);
          fx({ kind: "spark", at: star, color: "var(--px-shine)" });
          tap();
          await sleep(260);
          frame("stand", !faceLeft); // 뒤돌기
          await sleep(80);
          await run(landing, 230);
          frame("runB", home.cx < landing.x + CENTER);
          await move(place(home), 300, 36);
          frame("stand");
          await sleep(60);
        } else if (name === "ranger") {
          // 그 자리에서 일어나 활을 꺼내 당기고 → 화살이 별까지 날아가 꽂힘 → 활을 거두고 숨기
          await popUp();
          await sleep(90);
          frame("draw");
          await sleep(230);
          frame("release");
          const flip = star.x < home.cx;
          const bowTip = { x: at.x + (flip ? 2 : W - 2), y: at.y + 13 * SCALE + 1 };
          fx({ kind: "arrow", from: bowTip, to: star }, 230);
          await sleep(210);
          fx({ kind: "spark", at: star, color: "var(--px-green)" });
          tap();
          await sleep(320);
          frame("stand");
          await sleep(120);
          await sinkDown();
        } else if (name === "wizard") {
          // 지팡이를 들고 펑! 사라짐 → 별 옆에 펑! 나타남 → 마법 → 펑! → 제자리에 나타남
          frame("cast");
          await sleep(150);
          fx({ kind: "poof", at: bodyCenter() });
          await teleport(true);
          await move(place(beside), 1);
          fx({ kind: "poof", at: bodyCenter() });
          await teleport(false);
          await sleep(70);
          fx({ kind: "spark", at: star, color: "var(--px-violet)" });
          fx({ kind: "poof", at: star });
          tap();
          await sleep(330);
          frame("stand");
          await sleep(80);
          fx({ kind: "poof", at: bodyCenter() });
          await teleport(true);
          await move(place(home), 1);
          fx({ kind: "poof", at: bodyCenter() });
          await teleport(false);
          await sleep(80);
        } else {
          // 성직자: 일어나 기도 → 빛기둥이 별에 내려옴 → 숨기
          await popUp();
          frame("pray");
          await sleep(160);
          fx({ kind: "beam", at: star }, 520);
          await sleep(230);
          fx({ kind: "spark", at: star, color: "var(--px-gold)" });
          tap();
          await sleep(360);
          frame("stand");
          await sleep(100);
          await sinkDown();
        }
      } finally {
        tap(); // 중간에 멈춰도(화면 이동 등) 별은 켠다
      }
    }

    return () => {
      start = null;
    };
  }, []);

  return (
    <>
      {actor && (
        <div ref={actorEl} className="star-actor" style={{ transform: `translate(${actor.start.x}px, ${actor.start.y}px)` }} aria-hidden="true">
          <div ref={spriteEl} className={`star-actor-sprite ${actor.flip ? "flip" : ""}`} style={{ transformOrigin: `${CENTER}px 100%` }}>
            <PixelSprite rows={actionRows(actor.name, actor.frame)} scale={SCALE} />
          </div>
        </div>
      )}
      {effects.map((e) => (
        <Effect key={e.id} effect={e} />
      ))}
    </>
  );
}

const SPARKS = 8;

function Effect({ effect }: { effect: Fx }) {
  const style = (p: Point, extra: Record<string, string | number> = {}) =>
    ({ left: p.x, top: p.y, ...extra }) as React.CSSProperties;
  switch (effect.kind) {
    case "slash":
      return (
        <div className={`fx fx-slash ${effect.flip ? "flip" : ""}`} style={style(effect.at)} aria-hidden="true">
          <PixelSprite rows={EFFECT_ROWS.slash} scale={3} />
        </div>
      );
    case "arrow": {
      const dx = effect.to.x - effect.from.x;
      const dy = effect.to.y - effect.from.y;
      const angle = `${Math.atan2(dy, dx)}rad`;
      return (
        <div className="fx fx-arrow" style={style(effect.from, { "--dx": `${dx}px`, "--dy": `${dy}px`, "--angle": angle })} aria-hidden="true">
          <PixelSprite rows={EFFECT_ROWS.arrow} scale={3} />
        </div>
      );
    }
    case "beam":
      return <div className="fx fx-beam" style={style(effect.at)} aria-hidden="true" />;
    case "poof":
    case "spark":
      return (
        <div
          className={`fx fx-${effect.kind}`}
          style={style(effect.at, effect.kind === "spark" ? { "--fx-color": effect.color } : {})}
          aria-hidden="true"
        >
          {Array.from({ length: SPARKS }, (_, i) => (
            <i key={i} style={{ "--a": `${(360 / SPARKS) * i + (effect.kind === "poof" ? 22 : 0)}deg` } as React.CSSProperties} />
          ))}
        </div>
      );
  }
}
