"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "../lib/user.tsx";
import { WEAPON_SPRITES } from "../lib/weapon-sprites.ts";
import { DRAW_COST } from "../lib/gacha.ts";
import { WEAPONS, isWeaponId } from "../lib/weapons.ts";
import { KeyShardIcon } from "./KeyGiftToast.tsx";
import { PixelSprite } from "./PixelPal.tsx";

// 보물상자 뽑기 결과 (lib/user.tsx의 drawWeapon). 상자가 떨어져 쿵 → 열쇠가 꽂힘 → 덜컥거리며 틈새로 등급 색 빛 →
// 번쩍 열리며 픽셀 조각이 터짐 → 실루엣이 튀어 올라 진짜 무기(또는 전설의 파편)가 된다.
// 등급이 높을수록 길고 화려하다(일반 약 1.2초, 희귀 1.8초, 영웅·파편 3초). "한 번 더"는 앞 두 박자를 건너뛰고,
// 화면을 누르면 바로 결과로 간다. 동작 줄이기면 바로 마지막 장면.
// 내 컴퓨터에서 시험할 때(npm run dev)는 주소 끝에 ?reveal=무기id 를 붙이면 연출을 볼 수 있다

// 보물상자 (28×26, Codex가 그림): 닫힘·자물쇠 풀림·틈새 빛·활짝
const CHEST_CLOSED = [
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  ".........KKKKKKKKKK.........",
  "......KKKEEEEEEEEEEKKK......",
  "....KKYEYGEGTTTTGEGYEYKK....",
  "...KGETGEGTTTTTTTTGEGTEGK...",
  "..KGETTGEGTTTTTTTTGEGTTEGK..",
  "..KGYTTGYGTtTTTTtTGYGTTYGK..",
  "..KGYttGYGtTKMMKTtGYGttYGK..",
  "..KGYttGGGtKMttMKtGGGttYGK..",
  "..KGGYYYYYYKmGGmKYYYYYYGGK..",
  "..KGEYYYYYKEEYYEEKYYYYYEGK..",
  "..KGGGGGGGKYYKKYYKGGGGGGGK..",
  "..KGETTGEGKYKKKKYKGEGTTEGK..",
  "..KGYTTGYGKGYKKYGKGYGTTYGK..",
  "..KGYttGYGtKGGGGKtGYGttYGK..",
  "..KGYttGYGttttttttGYGttYGK..",
  "..KGYttGYGttttttttGYGttYGK..",
  "..KGYttGGGttttttttGGGttYGK..",
  "..KGEYYYYYYYYYYYYYYYYYYEGK..",
  "...KGGGGGGGGGGGGGGGGGGGGK...",
  "....KKKKKKKKKKKKKKKKKKKK....",
  "............................",
];
const CHEST_RATTLE = [
  "............................",
  "............................",
  "............................",
  "............................",
  "............................",
  ".........KKKKKKKKKK.........",
  "......KKKEEEEEEEEEEKKK......",
  "....KKYEYGEGTTTTGEGYEYKK....",
  "...KGETGEGTTTTTTTTGEGTEGK...",
  "..KGETTGEGTTTTTTTTGEGTTEGK..",
  "..KGYTTGYGTtTTTTtTGYGTTYGK..",
  "..KGYttGYGtTTTTTTtGYGttYGK..",
  "..KGYttGGGtKMttMKtGGGttYGK..",
  "..KGGYYYYYYKMGGMKYYYYYYGGK..",
  "..KGEYYYYYYKmmmmKYYYYYYEGK..",
  "..KGGGGGGGKEEYYEEKGGGGGGGK..",
  "..KGETTGEGKYYKKYYKGEGTTEGK..",
  "..KGYTTGYGKYKKKKYKGYGTTYGK..",
  "..KGYttGYGKGYKKYGKGYGttYGK..",
  "..KGYttGYGtKGGGGKtGYGttYGK..",
  "..KGYttGYGttttttttGYGttYGK..",
  "..KGYttGGGttttttttGGGttYGK..",
  "..KGEYYYYYYYYYYYYYYYYYYEGK..",
  "...KGGGGGGGGGGGGGGGGGGGGK...",
  "....KKKKKKKKKKKKKKKKKKKK....",
  "............................",
];
const CHEST_CRACK = [
  "............................",
  "............................",
  ".........KKKKKKKKKK.........",
  "......KKKEEEEEEEEEEKKK......",
  "....KKYEYGEGTTTTGEGYEYKK....",
  "...KGETGEGTTTTTTTTGEGTEGK...",
  "..KGETTGEGTTTTTTTTGEGTTEGK..",
  "..KGYTTGYGTtTTTTtTGYGTTYGK..",
  "..KGYttGYGtTTTTTTtGYGttYGK..",
  "..KGYttGGGttttttttGGGttYGK..",
  "..KGGYYYYYYYYGGYYYYYYYYGGK..",
  "..KWEWWEEWWEEEEEEWWEEWWEWK..",
  "..KEWWWWWWWKMWWMKWWWWWWWEK..",
  "..KEEEEEWWWKMWWMKWWWEEEEEK..",
  "..KGEYYYYYYKmmmmKYYYYYYEGK..",
  "..KGGGGGGGKEEYYEEKGGGGGGGK..",
  "..KGETTGEGKYYKKYYKGEGTTEGK..",
  "..KGYTTGYGKYKKKKYKGYGTTYGK..",
  "..KGYttGYGKGYKKYGKGYGttYGK..",
  "..KGYttGYGtKGGGGKtGYGttYGK..",
  "..KGYttGYGttttttttGYGttYGK..",
  "..KGYttGGGttttttttGGGttYGK..",
  "..KGEYYYYYYYYYYYYYYYYYYEGK..",
  "...KGGGGGGGGGGGGGGGGGGGGK...",
  "....KKKKKKKKKKKKKKKKKKKK....",
  "............................",
];
const CHEST_OPEN = [
  "........KKKKKKKKKKKK........",
  ".....KKKYYYYYGGYYYYYKKK.....",
  "....KYEttGGttttttGGttEYK....",
  "...KYGttGYGttttttGYGttGYK...",
  "..KYGttGYGttttttttGYGttGYK..",
  "..KGYttGGGttttttttGGGttYGK..",
  "..KGYttGYGtTttttTtGYGttYGK..",
  "..KGYttGYGttttttttGYGttYGK..",
  "...KGGYYYYYYYYYYYYYYYYGGK...",
  "....KKGGGGGGGGGGGGGGGGKK....",
  "...KGEWWWWWWWWWWWWWWWWEGK...",
  "..KWWWWWWWWWWWWWWWWWWWWWWK..",
  "..KEEEEEEEEKMEEMKEEEEEEEEK..",
  "..KGYYYYYYYKMYYMKYYYYYYYGK..",
  "..KGEYYYYYYKmmmmKYYYYYYEGK..",
  "..KGGGGGGGKEEYYEEKGGGGGGGK..",
  "..KGETTGEGKYYKKYYKGEGTTEGK..",
  "..KGYTTGYGKYKKKKYKGYGTTYGK..",
  "..KGYttGYGKGYKKYGKGYGttYGK..",
  "..KGYttGYGtKGGGGKtGYGttYGK..",
  "..KGYttGYGttttttttGYGttYGK..",
  "..KGYttGGGttttttttGGGttYGK..",
  "..KGEYYYYYYYYYYYYYYYYYYEGK..",
  "...KGGGGGGGGGGGGGGGGGGGGK...",
  "....KKKKKKKKKKKKKKKKKKKK....",
  "............................",
];

// 전설의 파편 (12×13): 호박빛 수정 조각. 전설 무기 대신 나오고, 모아 두면 나중에 보상으로 바꾼다
const SHARD = [
  ".....KK.....",
  "....KEWK....",
  "...KEEYK....",
  "...KEYYFK...",
  "..KEYYYFK...",
  "..KEYYFFGK..",
  ".KEYYYFFGK..",
  ".KWEYYFGGK..",
  "..KEYFFGK...",
  "..KYYFGGK...",
  "...KYFGK....",
  "...KFGK.....",
  "....KK......",
];
const SHARD_NAME = "전설의 파편";
const SHARD_FLAVOR = "아직 잠든 전설의 한 조각. 모아 두면 언젠가 특별한 보상이 돼요.";

type Stage = "drop" | "key" | "rattle" | "crack" | "burst" | "rise" | "done";
const ORDER: Stage[] = ["drop", "key", "rattle", "crack", "burst", "rise", "done"];
// 박자마다 머무는 시간(ms). 일반은 80%나 나오니 짧게, 귀할수록 길게 뜸 들인다
const BEATS: Record<string, Record<Exclude<Stage, "done">, number>> = {
  common: { drop: 240, key: 220, rattle: 160, crack: 140, burst: 160, rise: 280 },
  rare: { drop: 280, key: 280, rattle: 320, crack: 300, burst: 220, rise: 400 },
  heroic: { drop: 340, key: 360, rattle: 800, crack: 700, burst: 360, rise: 440 },
  legendary: { drop: 340, key: 360, rattle: 800, crack: 700, burst: 360, rise: 440 },
};
const CHIPS: Record<string, number> = { common: 14, rare: 22, heroic: 36, legendary: 36 }; // 터지는 픽셀 조각 수
const SPARKLES: Record<string, number> = { common: 0, rare: 8, heroic: 16, legendary: 16 }; // 결과 화면에 떠다니는 빛

const CHEST_FRAME: Record<Stage, string[]> = {
  drop: CHEST_CLOSED,
  key: CHEST_CLOSED,
  rattle: CHEST_RATTLE,
  crack: CHEST_CRACK,
  burst: CHEST_OPEN,
  rise: CHEST_OPEN,
  done: CHEST_OPEN,
};

const silhouette = (rows: string[]) => rows.map((row) => row.replace(/[^.]/g, "B"));

function weaponRows(id: keyof typeof WEAPONS): string[] {
  const stamp = WEAPON_SPRITES[id].stand ?? WEAPON_SPRITES[id].punch;
  return stamp ? stamp.rows : ["."];
}

export function WeaponReveal() {
  const user = useUser();
  const { revealing, closeReveal, grantWeapon } = user;
  const [stage, setStage] = useState<Stage>("drop");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isAgain = useRef(false); // "한 번 더"로 열었는지 (상자가 이미 있으니 앞 두 박자를 건너뛴다)
  const grade = revealing ? (revealing.kind === "weapon" ? WEAPONS[revealing.weapon].grade : "legendary") : "common";

  // 시험용: 내 컴퓨터(npm run dev)에서 ?reveal=무기id
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const id = new URLSearchParams(window.location.search).get("reveal");
    if (id && isWeaponId(id)) grantWeapon(id);
  }, [grantWeapon]);

  useEffect(() => {
    if (!revealing) {
      isAgain.current = false;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage("done");
      return;
    }
    const beats = BEATS[grade];
    const stages = isAgain.current ? ORDER.slice(2) : ORDER;
    setStage(stages[0]);
    let at = 0;
    const list = stages.slice(1).map((next, i) => {
      at += beats[stages[i] as Exclude<Stage, "done">];
      return setTimeout(() => setStage(next), at);
    });
    timers.current = list;
    return () => list.forEach(clearTimeout);
  }, [revealing, grade]);

  // 화면을 누르면 건너뛰고 바로 결과로
  function skip() {
    if (stage === "done") return;
    timers.current.forEach(clearTimeout);
    setStage("done");
  }

  // 키보드로 쓰는 사람을 위해: Esc로 닫고, Tab은 창 안에서만 돌며, 닫히면 원래 자리로 돌려 놓는다
  const isOpen = revealing !== null;
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeReveal();
      if (event.key !== "Tab") return;
      const list = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const first = list[0];
      const last = list[list.length - 1];
      if (!first) event.preventDefault();
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [isOpen, closeReveal]);

  // 연출 중에는 창에, 결과가 나오면 첫 버튼에 초점을 둔다 ("한 번 더"를 눌러 버튼이 사라져도 초점을 잃지 않게)
  useEffect(() => {
    if (!isOpen) return;
    const first = stage === "done" ? dialogRef.current?.querySelector<HTMLButtonElement>("button") : null;
    (first ?? dialogRef.current)?.focus();
  }, [isOpen, stage]);

  // 픽셀 조각이 날아갈 방향과 거리 (둘레에 고르게, 거리는 조금씩 다르게)
  const chips = useMemo(
    () =>
      Array.from({ length: CHIPS[grade] }, (_, i) => {
        const angle = (i / CHIPS[grade]) * Math.PI * 2;
        const far = 90 + ((i * 37) % 80);
        return { "--dx": `${Math.round(Math.cos(angle) * far)}px`, "--dy": `${Math.round(Math.sin(angle) * far - 30)}px`, "--delay": `${(i % 4) * 20}ms` } as React.CSSProperties;
      }),
    [grade],
  );

  if (!revealing) return null;
  const weapon = revealing.kind === "weapon" ? WEAPONS[revealing.weapon] : null;
  const name = weapon ? weapon.name : SHARD_NAME;
  const rows = revealing.kind === "weapon" ? weaponRows(revealing.weapon) : SHARD;
  const shown = stage === "done";
  const canEquip = revealing.kind === "weapon" && user.avatar && user.avatar.weapon !== revealing.weapon;
  const canAgain = user.keys !== null && user.keys >= DRAW_COST;

  async function again() {
    isAgain.current = true;
    setBusy(true);
    await user.drawWeapon();
    setBusy(false);
  }

  return (
    <div ref={dialogRef} tabIndex={-1} className="reveal-backdrop" role="dialog" aria-modal="true" aria-label={shown ? name : "보물상자"} onClick={skip}>
      {/* 번쩍임은 흔들리는 .reveal 밖에 둔다 (안에 두면 화면 전체를 덮지 못한다) */}
      {stage === "burst" && <div className={`reveal-flash grade-${grade}`} aria-hidden="true" />}
      <div className={`reveal stage-${stage} grade-${grade}`}>
        {(stage === "rise" || shown) && (
          <div className={`reveal-weapon aura aura-${grade}`} aria-hidden="true">
            <PixelSprite rows={stage === "rise" ? silhouette(rows) : rows} scale={7} />
          </div>
        )}
        {shown &&
          Array.from({ length: SPARKLES[grade] }, (_, i) => (
            <i key={i} className="reveal-sparkle" aria-hidden="true" style={{ left: `${(i * 61) % 100}%`, top: `${(i * 37) % 170}px`, animationDelay: `${(i * 170) % 1400}ms` }} />
          ))}
        <div className="reveal-chest" aria-hidden="true">
          <PixelSprite rows={CHEST_FRAME[stage]} scale={5} />
          {stage === "key" && (
            <span className="reveal-key">
              <KeyShardIcon scale={3} />
            </span>
          )}
          {stage === "key" && <i className="reveal-click" />}
          {stage === "drop" && (
            <span className="reveal-dust">
              {[-70, -44, -18, 18, 44, 70].map((x) => (
                <i key={x} style={{ "--dx": `${x}px` } as React.CSSProperties} />
              ))}
            </span>
          )}
          {(stage === "burst" || stage === "rise") && (
            <span className="reveal-chips">
              {chips.map((style, i) => (
                <i key={i} style={style} />
              ))}
            </span>
          )}
        </div>
        <div className="reveal-text" aria-live="polite">
          {shown && (
            <>
              <p className={`reveal-name grade-name-${grade}`}>{name}</p>
              <p className="reveal-flavor">{weapon ? weapon.flavor : SHARD_FLAVOR}</p>
              {revealing.kind === "weapon" && revealing.duplicate && (
                <p className="reveal-refund">이미 가진 무기라 열쇠조각 {revealing.refund}개를 돌려받았어요</p>
              )}
              <div className="reveal-actions">
                <button type="button" className="button" onClick={closeReveal}>
                  닫기
                </button>
                {canAgain && (
                  <button type="button" className="button" disabled={busy} onClick={again}>
                    한 번 더
                  </button>
                )}
                {canEquip && (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      if (user.avatar) user.setAvatar({ ...user.avatar, weapon: revealing.weapon });
                      closeReveal();
                    }}
                  >
                    장착하기
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
