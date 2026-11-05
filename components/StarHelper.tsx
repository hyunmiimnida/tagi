"use client";

import { useEffect, useRef, useState } from "react";
import { EFFECTS } from "../lib/pixel-effects.ts";
import { SKILL_FX } from "../lib/skill-fx.ts";
import { ACTION_HEIGHT, ACTION_WIDTH, EFFECT_ROWS, actionRows } from "../lib/pixel-pals.ts";
import { WEAPONS } from "../lib/weapons.ts";
import type { RecipeStep, SkillId, WeaponDef, WeaponFamily } from "../lib/weapons.ts";
import type { ActionFrame, Avatar } from "../lib/pixel-pals.ts";
import { useUser } from "../lib/user.tsx";
import { PixelSprite } from "./PixelPal.tsx";
import { BurstEffect, PixelFrames } from "./PixelEffect.tsx";
import type { EffectId } from "../lib/pixel-effects.ts";

// 관심 표시(☆)를 켜면 내 캐릭터가 직접 별을 켜 준다. 스킬은 손에 든 무기로 정해진다(skillOf, 검·활·마법 지팡이·성직자 지팡이·맨손):
//   칼     카드에서 뛰어내려 별까지 달려가 칼을 휘두른다(칼바람) → 뒤돌아 달려서 복귀
//   활     그 자리에서 일어나 활을 꺼내 쏜다 → 화살이 별에 꽂힌다 → 다시 숨는다
//   마법   펑! 사라져 별 옆에 나타나 지팡이로 마법을 건다 → 펑! 사라져 제자리에 나타난다
//   기도   일어나 지팡이를 들고 기도한다 → 하늘에서 빛기둥이 별에 내려온다 → 다시 숨는다
//   맨손   카드에서 뛰어내려 별까지 달려가 폴짝 뛰며 주먹으로 톡 → 뒤돌아 달려서 복귀
// 출발하는 자리: 그 카드에서 빼꼼하던 캐릭터(화면에 보일 때), 아니면 아래 탭 바의 캐릭터.
// 별이 켜지는 순간 onTap(components/FavoriteButton.tsx가 별을 노랗게 바꾸고 반짝이를 띄운다).
// 기기의 "동작 줄이기"가 켜져 있거나 이미 한 명이 다녀오는 중이면 캐릭터 없이 바로 별이 켜진다 (false를 돌려준다)

// avatar·source: 저장된 내 캐릭터 대신 이 모습으로, 이 그림 자리에서 출발 (꾸미기 화면의 "써 보기")
type Options = { avatar?: Avatar; source?: SVGElement };
type Start = (button: HTMLElement, onTap: () => void, options?: Options) => boolean;
let start: Start | null = null;

export function requestStarHelper(button: HTMLElement, onTap: () => void, options?: Options): boolean {
  return start ? start(button, onTap, options) : false;
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
  | { id: number; kind: "beam"; at: Point }
  | { id: number; kind: "burst"; at: Point; effect: EffectId }
  // 날아가는 도트 그림 (마법 구슬·음표 등): from에서 to까지 ms 동안, arc만큼 위로 휘어서
  | { id: number; kind: "proj"; from: Point; to: Point; frames: string[][]; frameMs: number; ms: number; arc: number; scale?: number }
  // 한 번 재생하는 큰 도트 그림 (해일·날개·음파 등). ax·ay: 그림의 어느 비율 지점을 at에 맞출지 (0.5·0.5 = 가운데)
  | { id: number; kind: "sprite"; at: Point; frames: string[][]; frameMs: number; ax: number; ay: number; flip: boolean; scale?: number }
  // 화면 전체가 하얗게 한 번 번쩍, 별에서 퍼지는 노란 충격파 고리 (뇌신)
  | { id: number; kind: "flash" }
  | { id: number; kind: "ring"; at: Point };
type FxInput = Fx extends infer T ? (T extends Fx ? Omit<T, "id"> : never) : never;

interface Actor {
  avatar: Avatar;
  frame: ActionFrame;
  flip: boolean;
  start: Point; // 처음 그릴 자리 (그 뒤 움직임은 애니메이션이 맡는다)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DARK_MS = 2600; // 뇌신: 화면이 어두워졌다 걷히기까지 (app/globals.css의 .star-dark)
const BOLT_TIP = 4; // 뇌신 벼락 그림의 아래 뾰족한 끝 줄 수 (위로 이어 붙이는 조각은 잘라낸다)

// 화면(머리말과 아래 탭 바 사이)에 보이는지
function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 56 && r.top < window.innerHeight - 64;
}

export function StarHelper() {
  const { avatar } = useUser();
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  const [actor, setActor] = useState<Actor | null>(null);
  const [effects, setEffects] = useState<Fx[]>([]);
  const [dark, setDarkState] = useState<{ id: number; at: Point } | null>(null); // 뇌신: 어두워진 화면 (별 둘레만 조금 밝다)
  const busy = useRef(false);
  const actorEl = useRef<HTMLDivElement | null>(null);
  const spriteEl = useRef<HTMLDivElement | null>(null);
  const layerEl = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let fxId = 0;
    // 캐릭터와 효과는 모두 한 판(layer) 위에 그린다. 스킬 중에 스크롤하면 판을 같은 만큼 옮겨 별을 따라가게 한다
    let scrollStart = { x: window.scrollX, y: window.scrollY };
    const scrolled = () => ({ x: window.scrollX - scrollStart.x, y: window.scrollY - scrollStart.y });
    const moveLayer = () => {
      const d = scrolled();
      if (layerEl.current) layerEl.current.style.transform = `translate(${-d.x}px, ${-d.y}px)`;
    };
    window.addEventListener("scroll", moveLayer, { passive: true });
    const setDark = (next: { id: number; at: Point }) => {
      setDarkState(next);
      setTimeout(() => setDarkState((d) => (d?.id === next.id ? null : d)), DARK_MS);
    };
    const fx = (effect: FxInput, ms = 650) => {
      const id = ++fxId;
      setEffects((list) => [...list, { ...effect, id } as Fx]);
      setTimeout(() => setEffects((list) => list.filter((e) => e.id !== id)), ms);
    };

    start = (button, onTap, options) => {
      if (busy.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      const wallPal = button.closest(".pal-wall")?.querySelector<SVGElement>(".pal-peek-anchor svg[data-pal]");
      const source = options?.source ?? (wallPal && onScreen(wallPal) ? wallPal : document.querySelector<SVGElement>(".tab-pal[data-pal]"));
      const me = options?.avatar ?? avatarRef.current;
      if (!source || !me) return false;
      busy.current = true;
      void perform(me, source, button, onTap).finally(() => {
        source.style.visibility = "";
        setActor(null);
        busy.current = false;
      });
      return true;
    };

    async function perform(avatar: Avatar, source: SVGElement, button: HTMLElement, onTap: () => void) {
      let tapped = false;
      let starAt: Point | null = null;
      const tap = () => {
        if (!tapped) {
          onTap();
          // 희귀 이상 무기는 그 무기의 이펙트가 별 위치에서 터진다
          const effect = WEAPONS[avatar.weapon].effect;
          if (starAt && effect) fx({ kind: "burst", at: starAt, effect }, 520);
        }
        tapped = true;
      };
      try {
        scrollStart = { x: window.scrollX, y: window.scrollY };
        moveLayer();
        const s = source.getBoundingClientRect();
        const b = button.getBoundingClientRect();
        const home = { cx: s.left + s.width / 2, feet: s.bottom - 4 }; // 카드 윗선(또는 탭 아이콘) 위에 선 자리
        const star = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        starAt = star;
        // 별 왼쪽에 서서 오른쪽을 본다 (왼쪽 공간이 없으면 반대로)
        const faceLeft = star.x - 30 - CENTER < 4;
        const beside = { cx: faceLeft ? star.x + 30 : star.x - 30, feet: b.bottom - 2 };

        // 캐릭터 그리기 시작: 빼꼼하던 캐릭터를 숨기고 같은 자리에 선 모습으로
        const place = (p: { cx: number; feet: number }): Point => ({ x: p.cx - CENTER, y: p.feet - H });
        let at = place(home);
        source.style.visibility = "hidden";
        // 원거리 스킬은 제자리에서 별 쪽을 본다 (오른쪽을 보고 그린 그림이라 별이 왼쪽이면 뒤집는다)
        const faceTo = (p: Point) => p.x < home.cx;
        setActor({ avatar, frame: "stand", flip: faceLeft, start: at });
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

        const weapon = WEAPONS[avatar.weapon];
        const dir = faceLeft ? -1 : 1;
        const landing = place({ cx: Math.min(Math.max(beside.cx - dir * 56, 28), window.innerWidth - 28), feet: beside.feet });
        // 카드에서 뛰어내려 별 옆까지 달려가기 / 돌아오기
        const goToStar = async () => {
          frame("runB", landing.x + CENTER > home.cx ? false : true);
          await move(landing, 300, 36);
          frame("stand", faceLeft);
          await run(place(beside), 240);
        };
        const goHome = async () => {
          frame("stand", !faceLeft); // 뒤돌기
          await sleep(80);
          await run(landing, 240);
          // 돌아갈 자리는 지금 다시 잰다 (스크롤했으면 탭 바 캐릭터는 판 위에서 다른 곳에 있다)
          const r = source.getBoundingClientRect();
          const d = scrolled();
          const back = { cx: r.left + r.width / 2 + d.x, feet: r.bottom - 4 + d.y };
          frame("runB", back.cx < landing.x + CENTER);
          await move(place(back), 300, 36);
          frame("stand");
          await sleep(60);
        };
        // 손에 든 무기 끝 (별 쪽을 보고 선 몸의 앞쪽). dy: 그림 위에서 몇 칸 아래인지
        const handTip = (dy = 13): Point => ({ x: at.x + (faceTo(star) ? 2 : W - 2), y: at.y + dy * SCALE });
        // 그 자리에서 일어나 별 쪽을 보고 서기 (원거리 스킬)
        const standUp = async () => {
          frame("stand", faceTo(star));
          await popUp();
        };
        // 한 번 재생하는 큰 그림. 재생 시간(ms)을 돌려준다
        // 영웅 무기의 연출은 크게(3배) 그린다
        const big = weapon.grade === "heroic" || weapon.grade === "legendary" ? 3 : 2;
        const playFx = (frames: string[][], at: Point, frameMs: number, ax = 0.5, ay = 0.5, flip = false) => {
          const ms = frames.length * frameMs;
          // 큰 그림이 화면 밖으로 잘리지 않게 좌우로 밀어 넣는다
          const width = frames[0][0].length * big;
          const left = Math.min(Math.max(at.x - width * ax, 4), window.innerWidth - 4 - width);
          const x = width > window.innerWidth - 8 ? at.x : left + width * ax;
          fx({ kind: "sprite", at: { x, y: at.y }, frames, frameMs, ax, ay, flip, scale: big }, ms + 40);
          return ms;
        };
        // 날려 보내기: 도착할 때까지 기다린다
        const shoot = async (frames: string[][], from: Point, to: Point, ms: number, arc = 0, frameMs = 80) => {
          fx({ kind: "proj", from, to, frames, frameMs, ms, arc, scale: big }, ms);
          await sleep(ms);
        };
        const hideAgain = async () => {
          // 스킬 중에 스크롤해서 원래 자리(탭 바 등)와 멀어졌으면 호다닥 달려 돌아온 뒤 사라진다
          const r = source.getBoundingClientRect();
          const d = scrolled();
          const back = place({ cx: r.left + r.width / 2 + d.x, feet: r.bottom - 4 + d.y });
          const far = Math.hypot(back.x - at.x, back.y - at.y);
          if (far > 8) {
            frame("stand", back.x < at.x);
            await run(back, Math.min(350, 120 + far));
          }
          frame("stand");
          await sleep(100);
          await sinkDown();
        };

        // 스킬 (lib/weapons.ts의 skill). 아직 만들지 않은 스킬은 그 계열의 일반 스킬을 쓴다
        const SKILLS: Partial<Record<SkillId, () => Promise<void>>> = {
          // 목검: 달려가 칼을 치켜들었다 휘두르기
          "approach-slash": async () => {
            await goToStar();
            frame("windup");
            await sleep(130);
            frame("strike");
            fx({ kind: "slash", at: star, flip: faceLeft }, 320);
            fx({ kind: "spark", at: star, color: "var(--px-shine)" });
            tap();
            await sleep(260);
            await goHome();
          },
          // 맨손: 달려가 폴짝 뛰며 주먹으로 톡
          "fist-tap": async () => {
            await goToStar();
            const spot = at;
            await move({ x: spot.x, y: spot.y - 8 }, 110);
            frame("punch");
            fx({ kind: "spark", at: star, color: "var(--px-shine)" });
            tap();
            await sleep(170);
            frame("stand");
            await move(spot, 110);
            await sleep(100);
            await goHome();
          },
          // 서기의 철필: 달려가 펜 끝으로 콕
          "pencil-poke": async () => {
            await goToStar();
            frame("poke");
            fx({ kind: "spark", at: star, color: "var(--px-line)" });
            tap();
            await sleep(240);
            frame("stand");
            await sleep(80);
            await goHome();
          },
          // 단궁: 일어나 활을 당겨 쏘기 → 화살이 별에 꽂힘
          arrow: async () => {
            await standUp();
            await sleep(90);
            frame("draw");
            await sleep(230);
            frame("release");
            fx({ kind: "arrow", from: handTip(), to: star }, 230);
            await sleep(210);
            fx({ kind: "spark", at: star, color: "var(--px-green)" });
            tap();
            await sleep(320);
            await hideAgain();
          },
          // 견습 지팡이: 일어나 지팡이를 치켜들고 작은 마법 구슬을 날림
          "magic-orb": async () => {
            await standUp();
            frame("cast");
            await sleep(160);
            const ms = 360;
            fx({ kind: "proj", from: handTip(4), to: star, frames: SKILL_FX["magic-orb"], frameMs: 90, ms, arc: 10 }, ms);
            await sleep(ms);
            fx({ kind: "spark", at: star, color: "var(--px-violet)" });
            tap();
            await sleep(300);
            await hideAgain();
          },
          // 참나무 지팡이: 일어나 기도 → 별에 작은 빛 한 점
          "holy-dot": async () => {
            await standUp();
            frame("pray");
            await sleep(260);
            playFx(SKILL_FX["holy-dot"], star, 90);
            tap();
            await sleep(360);
            await hideAgain();
          },
          // 성광 지팡이: 일어나 기도 → 하늘에서 빛기둥
          "light-pillar": async () => {
            await standUp();
            frame("pray");
            await sleep(160);
            fx({ kind: "beam", at: star }, 520);
            await sleep(230);
            fx({ kind: "spark", at: star, color: "var(--px-gold)" });
            tap();
            await sleep(360);
            await hideAgain();
          },
          // 목동의 피리: 일어나 불면 음표 하나가 둥실 날아가 별에 닿음
          "note-float": async () => {
            await standUp();
            frame("play");
            await sleep(200);
            const ms = 520;
            fx({ kind: "proj", from: handTip(8), to: star, frames: EFFECTS.note.ambient, frameMs: 160, ms, arc: 26 }, ms);
            await sleep(ms);
            fx({ kind: "spark", at: star, color: "var(--px-violet)" });
            tap();
            await sleep(280);
            await hideAgain();
          },
        };
        // ── 희귀 ──
        // 청람검: 제자리에서 칼을 휘둘러 푸른 검기를 날림
        SKILLS["slash-wave"] = async () => {
          await standUp();
          frame("windup");
          await sleep(140);
          frame("strike");
          await shoot(SKILL_FX["slash-wave"], handTip(12), star, 280);
          tap();
          await sleep(320);
          await hideAgain();
        };
        // 별빛 지팡이: 반짝이 꼬리를 남기며 회전하는 별 에너지탄
        SKILLS["star-bolt"] = async () => {
          await standUp();
          frame("cast");
          await sleep(150);
          const from = handTip(4);
          const ms = 440;
          for (let k = 1; k <= 4; k++) {
            const t = k / 5;
            setTimeout(() => playFx(SKILL_FX["star-trail"], { x: from.x + (star.x - from.x) * t, y: from.y + (star.y - from.y) * t - 18 * Math.sin(Math.PI * t) }, 90), ms * t);
          }
          await shoot(SKILL_FX["star-bolt"], from, star, ms, 18, 70);
          tap();
          await sleep(320);
          await hideAgain();
        };
        // 바람활: 잎이 휘감긴 바람 화살
        SKILLS["wind-arrow"] = async () => {
          await standUp();
          await sleep(80);
          frame("draw");
          await sleep(230);
          frame("release");
          await shoot(SKILL_FX["wind-arrow"], handTip(), star, 260, 0, 70);
          tap();
          await sleep(320);
          await hideAgain();
        };
        // 밤잉크 펜: 달려가 펜으로 별을 빙 둘러 잉크 동그라미
        SKILLS["ink-circle"] = async () => {
          await goToStar();
          frame("poke");
          await sleep(playFx(SKILL_FX["ink-circle"], star, 70) - 70);
          tap();
          await sleep(200);
          frame("stand");
          await goHome();
        };
        // 기타: 줄지어 날아가는 음표 셋
        SKILLS["note-line"] = async () => {
          await standUp();
          frame("play");
          await sleep(160);
          const from = handTip(9);
          for (const [k, arc] of [16, 30, 44].entries()) {
            setTimeout(() => fx({ kind: "proj", from, to: star, frames: SKILL_FX["note-line"], frameMs: 110, ms: 460, arc }, 460), k * 130);
          }
          await sleep(460);
          tap();
          await sleep(460);
          await hideAgain();
        };

        // ── 영웅 ──
        // 벚꽃검 '춘풍': 꽃잎 검기 3연발
        SKILLS["blossom-wave"] = async () => {
          // 큰 검기 3연발(지나간 자리에 꽃잎 잔상) → 마지막 검기가 별에 닿으면 X자 베기와 함께 벚꽃이 피어남 → 꽃잎이 흩날리며 가라앉음
          await standUp();
          const petalFrames = EFFECTS.petal.ambient;
          for (const k of [0, 1, 2]) {
            frame("windup");
            await sleep(90);
            frame("strike");
            const from = handTip(11);
            const to = { x: star.x, y: star.y + (k - 1) * 10 };
            const ms = 230;
            // 꽃잎 잔상: 검기가 지나가는 길을 따라 차례로
            for (const t of [0.3, 0.55, 0.8]) {
              setTimeout(() => playFx(petalFrames, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - (k - 1) * 12 * Math.sin(Math.PI * t) }, 90), ms * t);
            }
            const hit = shoot(SKILL_FX["blossom-wave-2"], from, to, ms, (k - 1) * 12, 60);
            if (k === 2) await hit;
            else await sleep(130);
          }
          const bloom = playFx(SKILL_FX["cross-bloom"], star, 85);
          await sleep(85 * 2); // X자가 완성되는 순간 별이 켜진다
          tap();
          // 흩날리는 꽃잎
          [-34, -14, 8, 26, 40].forEach((dx, n) => {
            const start = { x: star.x + dx, y: star.y - 20 - (n % 2) * 12 };
            setTimeout(
              () => fx({ kind: "proj", from: start, to: { x: start.x + 14, y: start.y + 56 }, frames: petalFrames, frameMs: 140, ms: 900, arc: -8, scale: 2 }, 900),
              120 + n * 70,
            );
          });
          await sleep(bloom - 85 * 2 + 120);
          await hideAgain();
        };
        // 해일의 지팡이: 지팡이를 치켜들면 화면 아래에서 해일이 솟아 별을 덮침
        SKILLS["tsunami"] = async () => {
          await standUp();
          frame("cast");
          await sleep(180);
          // 파도 머리가 말려 덮치는 곳(그림의 오른쪽 70%, 아래쪽 85%)이 별에 오게
          const flip = faceTo(star);
          const ms = playFx(SKILL_FX.tsunami, { x: star.x, y: star.y + 18 }, 150, flip ? 0.3 : 0.7, 0.85, flip);
          await sleep(150 * 3); // 파도 머리가 별을 덮치는 순간
          tap();
          await sleep(ms - 150 * 3 + 150);
          await hideAgain();
        };
        // 유성궁: 하늘로 쏜 화살이 유성비가 되어 쏟아짐
        SKILLS["meteor-rain"] = async () => {
          await standUp();
          frame("draw");
          await sleep(240);
          frame("release");
          await sleep(160);
          for (const k of [0, 1, 2]) {
            const to = { x: star.x + (k - 1) * 18, y: star.y + (k === 1 ? 0 : 6) };
            const from = { x: to.x - 110, y: to.y - 170 };
            setTimeout(() => {
              fx({ kind: "proj", from, to, frames: SKILL_FX["meteor-arrow"], frameMs: 60, ms: 280, arc: 0, scale: big }, 280);
              setTimeout(() => playFx(SKILL_FX["meteor-impact"], to, 100, 0.5, 0.7), 280);
            }, k * 150);
          }
          await sleep(280 + 150);
          tap();
          await sleep(560);
          await hideAgain();
        };
        // 천사의 홀: 기도하면 빛기둥과 함께 별 위로 날개 후광이 펼쳐지고 깃털이 흩날림
        SKILLS["angel-wings"] = async () => {
          await standUp();
          frame("pray");
          await sleep(160);
          fx({ kind: "beam", at: star }, 620);
          const ms = playFx(SKILL_FX["angel-wings"], star, 160, 0.5, 0.75);
          for (const dx of [-30, 26, -12]) {
            const from = { x: star.x + dx, y: star.y - 26 };
            setTimeout(() => fx({ kind: "proj", from, to: { x: from.x + dx / 3, y: from.y + 46 }, frames: SKILL_FX.feather, frameMs: 160, ms: 700, arc: -6 }, 700), 200 + Math.abs(dx) * 4);
          }
          await sleep(240);
          tap();
          await sleep(ms);
          await hideAgain();
        };
        // 깃펜 '필승': 펜을 휘두르면 글자 조각이 쏟아지고 마지막에 도장 쾅
        SKILLS["letter-storm"] = async () => {
          await standUp();
          frame("poke");
          await sleep(150);
          SKILL_FX.glyphs.forEach((glyph, k) => {
            const to = { x: star.x + ((k % 3) - 1) * 22, y: star.y + (k < 3 ? -16 : 10) };
            setTimeout(() => fx({ kind: "proj", from: { x: to.x - 20, y: to.y - 90 }, to, frames: [glyph], frameMs: 100, ms: 300, arc: -10 }, 340), k * 70);
          });
          await sleep(6 * 70 + 260);
          const ms = playFx(SKILL_FX["seal-stamp"], star, 120);
          await sleep(90);
          tap();
          await sleep(ms);
          await hideAgain();
        };
        // 그랜드 하프: 무지개 음파가 퍼지고 음표가 별 주위로
        SKILLS["sound-ring"] = async () => {
          await standUp();
          frame("play");
          await sleep(160);
          const from = handTip(9);
          for (const [k, arc] of [20, 40].entries()) {
            setTimeout(() => fx({ kind: "proj", from, to: star, frames: SKILL_FX["note-line"], frameMs: 110, ms: 380, arc }, 380), k * 110);
          }
          await sleep(380);
          const ms = playFx(SKILL_FX["sound-ring"], star, 130);
          tap();
          await sleep(ms);
          await hideAgain();
        };

        // ── 전설 ──
        // 뇌신: 제자리에서 일어나 검을 치켜들면 사방의 전기가 검 끝으로 빨려 들고, 크게 휘두른다 → 화면이 깊게 어두워지고
        //   화면 맨 위에서 굵은 노란 벼락이 별에 꽂힌다(양옆 갈래 벼락, 한 번 더 내리침) → 번쩍(1초에 3번을 넘지 않게) · 크게 흔들림 ·
        //   충격파 고리 · 사방으로 튀는 전기 조각 · 별 둘레에 남는 지지직 → 어둠이 천천히 걷히면 다시 숨는다
        SKILLS["thunder-god"] = async () => {
          await standUp();
          const left = faceTo(star); // 별이 왼쪽이면 왼쪽을 본다
          // 검 끝 (치켜든 자세에서 머리 위)
          const bladeTop = (): Point => ({ x: at.x + (left ? ACTION_WIDTH - 20 : 20) * SCALE, y: at.y + 2 });
          const spark = SKILL_FX["thunder-spark"];
          // 치켜들고 번개를 모은다: 사방에서 전기가 검 끝으로 빨려 들고, 몸이 떨린다
          frame("windup");
          await sleep(120);
          const charge = SKILL_FX["thunder-charge"];
          for (let k = 0; k < 3; k++) {
            const tip = bladeTop();
            fx({ kind: "sprite", at: tip, frames: charge, frameMs: 80, ax: 0.5, ay: 0.5, flip: false, scale: 3 + Math.min(k, 1) }, charge.length * 80 + 40);
            for (let n = 0; n < 6; n++) {
              const a = (n / 6) * Math.PI * 2 + k;
              const from = { x: tip.x + Math.cos(a) * 70, y: tip.y + Math.sin(a) * 60 };
              setTimeout(() => fx({ kind: "proj", from, to: tip, frames: spark, frameMs: 60, ms: 260, arc: 6, scale: 2 }, 260), n * 30);
            }
            sprite.animate([{ translate: "0 0" }, { translate: "1px -1px" }, { translate: "-1px 1px" }, { translate: "1px 1px" }, { translate: "0 0" }], { duration: 320, easing: "steps(5, end)" });
            await sleep(charge.length * 80);
          }
          // 제자리에서 크게 휘두른다: 앞쪽에 큰 번개 검기
          frame("strike");
          const slash = SKILL_FX["thunder-slash"];
          fx({ kind: "sprite", at: { x: at.x + (left ? 0 : W), y: at.y + H / 2 }, frames: slash, frameMs: 70, ax: left ? 0.75 : 0.25, ay: 0.5, flip: left, scale: 4 }, slash.length * 70 + 40);
          await sleep(160);
          // 화면이 깊게 어두워지고 (별 둘레만 조금 밝게) 하늘에서 벼락
          setDark({ id: ++fxId, at: star });
          await sleep(260);
          // 벼락: 화면 맨 위에서부터 땅(to)까지. 맨 아래(끝이 뾰족한 그림) 위로 끝을 잘라낸 그림을 이어 붙여 끊김 없이
          const bolt = SKILL_FX["thunder-bolt"];
          const upper = bolt.map((f) => f.slice(0, -BOLT_TIP));
          const strike = (to: Point, scale: number, frameMs: number) => {
            const ms = bolt.length * frameMs + 40;
            const tipTop = to.y - bolt[0].length * scale;
            const piece = upper[0].length * scale;
            fx({ kind: "sprite", at: to, frames: bolt, frameMs, ax: 0.5, ay: 1, flip: false, scale }, ms);
            for (let k = 0; tipTop - k * piece > 0; k++) {
              fx({ kind: "sprite", at: { x: to.x, y: tipTop - k * piece }, frames: upper, frameMs, ax: 0.5, ay: 1, flip: false, scale }, ms);
            }
          };
          strike(star, 5, 110);
          // 양옆 갈래 벼락
          setTimeout(() => strike({ x: star.x - 58, y: star.y + 14 }, 3, 90), 90);
          setTimeout(() => strike({ x: star.x + 52, y: star.y + 6 }, 3, 90), 170);
          await sleep(110);
          // 꽂히는 순간: 별이 켜지고 번쩍 · 크게 흔들림 · 충격 · 충격파 · 흩어지는 전기
          tap();
          fx({ kind: "flash" }, 220);
          setTimeout(() => fx({ kind: "flash" }, 220), 450); // 두 번째 번쩍 (첫 번째와 0.45초 떨어져 1초에 3번을 넘지 않는다)
          document.querySelector("main")?.animate(
            [
              { translate: "0 0" }, { translate: "-7px 4px" }, { translate: "6px -5px" }, { translate: "-5px 3px" },
              { translate: "4px -3px" }, { translate: "-2px 2px" }, { translate: "1px -1px" }, { translate: "0 0" },
            ],
            { duration: 560, easing: "steps(8, end)" },
          );
          playFx(SKILL_FX["thunder-impact"], star, 80);
          fx({ kind: "sprite", at: star, frames: SKILL_FX["thunder-impact"], frameMs: 90, ax: 0.5, ay: 0.5, flip: false, scale: 5 }, 5 * 90 + 40);
          fx({ kind: "ring", at: star }, 700);
          setTimeout(() => fx({ kind: "ring", at: star }, 700), 160);
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2 + 0.2;
            const r = 80 + (k % 4) * 22;
            const to = { x: star.x + Math.cos(a) * r, y: star.y + Math.sin(a) * r * 0.8 };
            fx({ kind: "proj", from: star, to, frames: spark, frameMs: 70, ms: 520, arc: 10, scale: 3 }, 520);
          }
          // 한 번 더 내리치는 벼락 (번쩍임 없이)
          setTimeout(() => strike(star, 5, 90), 330);
          // 별 둘레에 남는 지지직
          for (let n = 0; n < 9; n++) {
            setTimeout(() => {
              const a = n * 2.4;
              fx({ kind: "burst", at: { x: star.x + Math.cos(a) * 26, y: star.y + Math.sin(a) * 20 }, effect: "thunder" }, 520);
            }, 240 + n * 130);
          }
          // 검을 다시 치켜들고 버틴다 → 어둠이 걷히면 다시 숨는다
          await sleep(360);
          frame("windup");
          await sleep(900);
          frame("stand");
          await sleep(500);
          await hideAgain();
        };

        // 대본 실행 (lib/weapons.ts의 RecipeStep). 모르는 그림 id는 건너뛴다
        const fxFrames = (id: string): string[][] | null => (SKILL_FX as Record<string, string[][]>)[id] ?? null;
        const runRecipe = async (steps: RecipeStep[]) => {
          for (const step of steps) {
            switch (step.do) {
              case "standUp":
                await standUp();
                break;
              case "goToStar":
                await goToStar();
                break;
              case "goHome":
                await goHome();
                break;
              case "hide":
                await hideAgain();
                break;
              case "tap":
                tap();
                break;
              case "beam":
                fx({ kind: "beam", at: star }, 520);
                break;
              case "slash":
                fx({ kind: "slash", at: star, flip: faceLeft }, 320);
                break;
              case "spark":
                fx({ kind: "spark", at: star, color: `var(--px-${step.color ?? "shine"})` });
                break;
              case "wait":
                await sleep(step.ms);
                break;
              case "pose":
                frame(step.pose as ActionFrame);
                await sleep(step.ms ?? 120);
                break;
              case "shoot": {
                const frames = fxFrames(step.fx);
                if (!frames) break;
                const { count = 1, stagger = 0, spread = 0, ms = 300, arc = 0, frameMs = 80, from = "hand" } = step;
                for (let k = 0; k < count; k++) {
                  // 여러 개면 좌우로 고르게 흩는다
                  const dx = count > 1 ? (k / (count - 1) - 0.5) * 2 * spread : 0;
                  const to = { x: star.x + dx, y: star.y };
                  const start =
                    from === "sky" ? { x: to.x - 90, y: to.y - 160 } : from === "ground" ? { x: to.x - 40, y: to.y + 70 } : handTip(9);
                  setTimeout(() => fx({ kind: "proj", from: start, to, frames, frameMs, ms, arc, scale: big }, ms), k * stagger);
                }
                await sleep((count - 1) * stagger + ms);
                break;
              }
              case "play": {
                const frames = fxFrames(step.fx);
                if (!frames) break;
                const at = step.at === "self" ? bodyCenter() : star;
                const ms = playFx(frames, at, step.frameMs ?? 100, step.ax ?? 0.5, step.ay ?? 0.5);
                if (step.wait) await sleep(ms);
                break;
              }
            }
          }
        };

        const COMMON_SKILL: Record<WeaponFamily, SkillId> = {
          sword: "approach-slash",
          staff: "magic-orb",
          bow: "arrow",
          relic: "holy-dot",
          pen: "pencil-poke",
          instrument: "note-float",
          fist: "fist-tap",
        };
        const recipe = (weapon as WeaponDef).recipe;
        const script = recipe ? () => runRecipe(recipe) : (SKILLS[weapon.skill] ?? SKILLS[COMMON_SKILL[weapon.family]]);
        if (script) await script();
      } finally {
        tap(); // 중간에 멈춰도(화면 이동 등) 별은 켠다
      }
    }

    return () => {
      start = null;
      window.removeEventListener("scroll", moveLayer);
    };
  }, []);

  return (
    <div ref={layerEl} className="star-layer">
      {dark && <div key={dark.id} className="star-dark" style={{ "--x": `${dark.at.x}px`, "--y": `${dark.at.y}px` } as React.CSSProperties} aria-hidden="true" />}
      {actor && (
        <div ref={actorEl} className="star-actor" style={{ transform: `translate(${actor.start.x}px, ${actor.start.y}px)` }} aria-hidden="true">
          <div ref={spriteEl} className={`star-actor-sprite ${actor.flip ? "flip" : ""}`} style={{ transformOrigin: `${CENTER}px 100%` }}>
            <PixelSprite rows={actionRows(actor.avatar, actor.frame)} scale={SCALE} />
          </div>
        </div>
      )}
      {effects.map((e) => (
        <Effect key={e.id} effect={e} />
      ))}
    </div>
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
    case "burst":
      return (
        <div className="fx fx-burst" style={style(effect.at)} aria-hidden="true">
          <BurstEffect effect={effect.effect} />
        </div>
      );
    case "proj": {
      const dx = effect.to.x - effect.from.x;
      const dy = effect.to.y - effect.from.y;
      return (
        <div
          className="fx fx-proj"
          style={style(effect.from, { "--dx": `${dx}px`, "--dy": `${dy}px`, "--arc": `${effect.arc}px`, "--dur": `${effect.ms}ms` })}
          aria-hidden="true"
        >
          <span className={dx < 0 ? "flip" : ""}>
            <PixelFrames frames={effect.frames} scale={effect.scale ?? 2} frameMs={effect.frameMs} loop />
          </span>
        </div>
      );
    }
    case "sprite":
      return (
        <div
          className={`fx fx-sprite ${effect.flip ? "flip" : ""}`}
          style={style(effect.at, { "--ax": effect.ax, "--ay": effect.ay })}
          aria-hidden="true"
        >
          <PixelFrames frames={effect.frames} scale={effect.scale ?? 2} frameMs={effect.frameMs} />
        </div>
      );
    case "beam":
      return <div className="fx fx-beam" style={style(effect.at)} aria-hidden="true" />;
    case "flash":
      return <div className="fx-flash" aria-hidden="true" />;
    case "ring":
      return <div className="fx fx-ring" style={style(effect.at)} aria-hidden="true" />;
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
