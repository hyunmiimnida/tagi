"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AVATAR_COLORS, HEADWEAR_NAMES, OUTFIT_NAMES, actionRows, palRows } from "../lib/pixel-pals.ts";
import type { Avatar, Headwear, Outfit } from "../lib/pixel-pals.ts";
import { useUser } from "../lib/user.tsx";
import { WEAPON_SPRITES } from "../lib/weapon-sprites.ts";
import { GRADES, WEAPONS, WEAPON_IDS, owns } from "../lib/weapons.ts";
import type { WeaponDef, WeaponId } from "../lib/weapons.ts";
import { ChevronIcon, LockIcon, StarIcon } from "./Icons.tsx";
import { AmbientEffect, BurstEffect } from "./PixelEffect.tsx";
import type { ActionFrame } from "../lib/pixel-pals.ts";
import type { WeaponFamily } from "../lib/weapons.ts";
import { PixelSprite } from "./PixelPal.tsx";
import { requestStarHelper } from "./StarHelper.tsx";
import { TreasureBox } from "./TreasureBox.tsx";

// 내 캐릭터 꾸미기 (/my/avatar): 무기 도감에서 무기를 골라 장착하고, 머리 장식·옷과 그 색을 바꾼다. 고르면 바로 내 캐릭터에 반영된다.
// 등급은 글자로 쓰지 않는다: 무기를 감싼 아우라(.aura-*)와 이름 색(.grade-name-*: 일반 회색·희귀 파랑·영웅 보라·전설 호박), 아래 칸은 등급마다 한 줄 (app/globals.css)
// 아직 얻지 못한 무기는 아우라는 그대로 두고 그림은 실루엣, 이름은 ???. 무기와 스킬의 관계는 설명하지 않는다 (써 보며 알아채는 재미)

const HEADWEARS = Object.keys(HEADWEAR_NAMES) as Headwear[];
const OUTFITS = Object.keys(OUTFIT_NAMES) as Outfit[];
const FAMILY_ORDER = ["fist", "sword", "staff", "bow", "relic", "pen", "instrument"];

// 장착 연출: 새 무기를 한 번 써 보는 자세들 [자세, 머무는 시간]
const TRY_SWING: Record<WeaponFamily, [ActionFrame, number][]> = {
  sword: [["windup", 160], ["strike", 300]],
  staff: [["cast", 420]],
  bow: [["draw", 240], ["release", 240]],
  relic: [["pray", 420]],
  pen: [["poke", 380]],
  instrument: [["play", 420]],
  fist: [["punch", 360]],
};

// 도감 순서: 등급(일반 → 전설) → 계열
const CODEX: WeaponId[] = [...WEAPON_IDS].sort(
  (a, b) =>
    GRADES.indexOf(WEAPONS[a].grade) - GRADES.indexOf(WEAPONS[b].grade) ||
    FAMILY_ORDER.indexOf(WEAPONS[a].family) - FAMILY_ORDER.indexOf(WEAPONS[b].family),
);

// 무기만 그린 그림 (서 있는 자세, 주먹은 주먹). 잠긴 무기는 실루엣 (어두운 진열장 위에서 보이게 회색)
function weaponRows(id: WeaponId, locked: boolean): string[] {
  const sprites = WEAPON_SPRITES[id];
  const stamp = sprites.stand ?? sprites.punch;
  if (!stamp) return ["."];
  return locked ? stamp.rows.map((row) => row.replace(/[^.]/g, "m")) : stamp.rows;
}

export function AvatarEditor() {
  const user = useUser();
  const avatar = user.avatar;
  const [index, setIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [demoOn, setDemoOn] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const swipe = useRef<number | null>(null);
  const [swing, setSwing] = useState<ActionFrame | null>(null); // 장착 연출 중인 자세
  const [flash, setFlash] = useState(0); // 장착 순간 이펙트 (바뀔 때마다 다시 재생)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // 처음에는 들고 있는 무기의 쪽을 펼친다
  useEffect(() => {
    if (avatar && index === null) setIndex(Math.max(0, CODEX.indexOf(avatar.weapon)));
  }, [avatar, index]);

  // 아래 작은 칸 줄에서 지금 보는 무기가 보이게 옮긴다
  useEffect(() => {
    if (index === null) return;
    stripRef.current?.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index]);

  const ownedCount = useMemo(() => CODEX.filter((id) => owns(user.ownedWeapons, id)).length, [user.ownedWeapons]);

  if (!avatar || index === null) {
    return <div className="card avatar-editor skeleton-block tall" aria-busy="true" />;
  }

  const shownId = CODEX[index];
  const shown: WeaponDef = WEAPONS[shownId];
  const shownLocked = !owns(user.ownedWeapons, shownId);
  const equipped: WeaponDef = WEAPONS[avatar.weapon];
  const equippedHere = avatar.weapon === shownId;

  const change = (patch: Partial<Avatar>, message = "") => {
    user.setAvatar({ ...avatar, ...patch });
    setNotice(message);
  };
  // 장착하면 캐릭터가 새 무기를 한 번 휘둘러 보고, 마지막 자세에서 그 무기의 이펙트가 터진다 (동작 줄이기면 바로)
  function equip(id: WeaponId) {
    change({ weapon: id }, "장착했어요.");
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let at = 120;
    for (const [pose, ms] of TRY_SWING[WEAPONS[id].family]) {
      timers.current.push(setTimeout(() => setSwing(pose), at));
      at += ms;
    }
    timers.current.push(setTimeout(() => setFlash((n) => n + 1), at - 180));
    timers.current.push(setTimeout(() => setSwing(null), at + 260));
  }

  const go = (step: number) => {
    setIndex((index + step + CODEX.length) % CODEX.length);
    setNotice("");
  };

  // 써 보기: 지금 모습으로 옆의 별을 켜 본다 (관심 표시는 바뀌지 않는다)
  function tryStar(event: React.MouseEvent<HTMLButtonElement>) {
    if (demoOn) {
      setDemoOn(false);
      return;
    }
    const source = stageRef.current?.querySelector<SVGElement>("svg") ?? undefined;
    const coming = requestStarHelper(event.currentTarget, () => setDemoOn(true), { avatar: avatar ?? undefined, source });
    if (!coming) setDemoOn(true);
  }

  const option = (key: string, label: string, on: boolean, onClick: () => void, picture: React.ReactNode) => (
    <button key={key} type="button" className={`avatar-option ${on ? "on" : ""}`} aria-pressed={on} aria-label={label} title={label} onClick={onClick}>
      {picture}
    </button>
  );

  const swatches = (value: string, onPick: (color: string) => void, label: string) => (
    <div className="avatar-swatches" role="group" aria-label={label}>
      {AVATAR_COLORS.map(([color, name]) => (
        <button
          key={color}
          type="button"
          className={`avatar-swatch ${value === color ? "on" : ""}`}
          style={{ background: `var(--px-${color})` }}
          aria-pressed={value === color}
          aria-label={name}
          title={name}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  );

  return (
    <div className="avatar-editor">
      {/* 내 캐릭터: 들고 있는 무기의 아우라가 뒤에서 빛난다 */}
      <section className="card vitrine avatar-stage-card">
        <div className={`avatar-preview aura aura-${equipped.grade}`}>
          <PixelSprite rows={actionRows(avatar, swing ?? "stand")} scale={6} />
          {flash > 0 && (
            <span key={flash} className={`equip-flash ${equipped.effect ? "" : "plain"}`} aria-hidden="true">
              {equipped.effect ? <BurstEffect effect={equipped.effect} scale={3} /> : <i />}
            </span>
          )}
          {equipped.effect && <AmbientEffect key={equipped.effect} effect={equipped.effect} every={equipped.grade === "rare" ? 2400 : 1400} />}
        </div>
        <p className={`avatar-weapon-name grade-name-${equipped.grade}`}>{equipped.name}</p>
        <div className="avatar-try">
          <div ref={stageRef} className="avatar-try-pal" aria-hidden="true">
            <PixelSprite rows={actionRows(avatar, "stand")} scale={2} />
          </div>
          <button type="button" className={`favorite avatar-try-star ${demoOn ? "on" : ""}`} aria-pressed={demoOn} aria-label="별 눌러 보기" onClick={tryStar}>
            <StarIcon filled={demoOn} />
          </button>
          <span className="avatar-try-hint">별을 눌러 보세요</span>
        </div>
      </section>

      {/* 보물상자: 열쇠조각으로 무기 뽑기 */}
      <TreasureBox />

      {/* 무기 도감: 한 장씩 넘겨 본다 (좌우 버튼·밀기·작은 칸) */}
      <section className="card codex" aria-roledescription="도감">
        <div className="codex-head">
          <h2 className="card-title">무기 도감</h2>
          <span className="codex-count">
            {ownedCount} / {CODEX.length}
          </span>
        </div>

        <div
          className="codex-stage"
          onPointerDown={(e) => (swipe.current = e.clientX)}
          onPointerUp={(e) => {
            if (swipe.current === null) return;
            const dx = e.clientX - swipe.current;
            swipe.current = null;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") go(-1);
            if (e.key === "ArrowRight") go(1);
          }}
        >
          <button type="button" className="codex-arrow" aria-label="이전 무기" onClick={() => go(-1)}>
            <ChevronIcon dir="left" size={22} />
          </button>
          <div className={`codex-card vitrine aura aura-${shown.grade} ${shownLocked ? "locked" : ""}`} aria-live="polite">
            <div className="codex-art">
              <PixelSprite rows={weaponRows(shownId, shownLocked)} scale={7} />
              {shownLocked && (
                <span className="codex-lock" aria-hidden="true">
                  <LockIcon size={18} />
                </span>
              )}
            </div>
            <p className={`codex-name grade-name-${shown.grade}`}>{shownLocked ? "???" : shown.name}</p>
            <p className="codex-flavor">{shownLocked ? (shown.grade === "legendary" ? "아직 잠들어 있는 전설이에요." : "보물상자에서 나올지도 몰라요.") : (shown.flavor ?? "")}</p>
          </div>
          <button type="button" className="codex-arrow" aria-label="다음 무기" onClick={() => go(1)}>
            <ChevronIcon dir="right" size={22} />
          </button>
        </div>

        <div className="codex-actions">
          {shownLocked ? (
            <span className="codex-status">
              <LockIcon size={14} /> 잠김
            </span>
          ) : equippedHere ? (
            <span className="codex-status equipped">장착 중</span>
          ) : (
            <button type="button" className="button primary" onClick={() => equip(shownId)}>
              장착하기
            </button>
          )}
        </div>

        {/* 작은 칸: 등급마다 한 줄 (줄 앞의 색 막대가 등급 색), 눌러서 바로 그 무기로 */}
        <div className="codex-rows" ref={stripRef}>
          {GRADES.map((grade) => (
            <div key={grade} className={`codex-row grade-${grade}`} role="list">
              {CODEX.filter((id) => WEAPONS[id].grade === grade).map((id) => {
                const i = CODEX.indexOf(id);
                const locked = !owns(user.ownedWeapons, id);
                const label = locked ? "잠긴 무기" : WEAPONS[id].name;
                return (
                  <button
                    key={id}
                    type="button"
                    role="listitem"
                    data-i={i}
                    className={`codex-slot aura aura-${grade} ${i === index ? "on" : ""} ${avatar.weapon === id ? "worn" : ""} ${locked ? "locked" : ""}`}
                    aria-label={avatar.weapon === id ? `${label} (장착 중)` : label}
                    aria-current={i === index}
                    onClick={() => {
                      setIndex(i);
                      setNotice("");
                    }}
                  >
                    <PixelSprite rows={weaponRows(id, locked)} scale={2} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="avatar-notice" role="status">
          {notice}
        </p>
      </section>

      {/* 외형 */}
      <section className="card avatar-section">
        <h2 className="card-title">머리 장식</h2>
        <div className="avatar-options">
          {HEADWEARS.map((h) =>
            option(h, HEADWEAR_NAMES[h], avatar.headwear === h, () => change({ headwear: h }), <PixelSprite rows={palRows({ ...avatar, headwear: h }, "sit").slice(0, 12)} scale={3} />),
          )}
        </div>
        {swatches(avatar.headwearColor, (color) => change({ headwearColor: color }), "머리 장식 색")}

        <h2 className="card-title avatar-subtitle">옷</h2>
        <div className="avatar-options">
          {OUTFITS.map((o) =>
            option(o, OUTFIT_NAMES[o], avatar.outfit === o, () => change({ outfit: o }), <PixelSprite rows={palRows({ ...avatar, outfit: o }, "sit")} scale={2} />),
          )}
        </div>
        {swatches(avatar.outfitColor, (color) => change({ outfitColor: color }), "옷 색")}
      </section>
    </div>
  );
}
