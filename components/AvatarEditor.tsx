"use client";

import { useEffect, useRef, useState } from "react";
import { AVATAR_COLORS, HEADWEAR_NAMES, OUTFIT_NAMES, actionRows, palRows } from "../lib/pixel-pals.ts";
import type { Avatar, Headwear, Outfit } from "../lib/pixel-pals.ts";
import { useUser } from "../lib/user.tsx";
import { WEAPON_SPRITES } from "../lib/weapon-sprites.ts";
import { GRADES, GRADE_NAMES, WEAPONS, WEAPON_IDS, owns } from "../lib/weapons.ts";
import type { WeaponId } from "../lib/weapons.ts";
import { LockIcon, StarIcon } from "./Icons.tsx";
import { AmbientEffect } from "./PixelEffect.tsx";
import { PixelSprite } from "./PixelPal.tsx";
import { requestStarHelper } from "./StarHelper.tsx";

// 내 캐릭터 꾸미기 (/my/avatar): 머리 장식·옷과 그 색, 손에 든 무기를 고른다.
// 고르는 동안은 미리보기에만 보이고 "저장"을 눌러야 내 캐릭터가 바뀐다.
// 아직 얻지 못한 무기는 자물쇠와 실루엣으로만 보인다. 무기와 스킬의 관계는 설명하지 않는다 (써 보며 알아채는 재미)

const HEADWEARS = Object.keys(HEADWEAR_NAMES) as Headwear[];
const OUTFITS = Object.keys(OUTFIT_NAMES) as Outfit[];

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

// 무기만 그린 작은 그림 (서 있는 자세, 주먹은 주먹). 잠긴 무기는 실루엣(모든 칸을 외곽선 색으로)
function weaponRows(id: WeaponId, locked: boolean): string[] {
  const sprites = WEAPON_SPRITES[id];
  const stamp = sprites.stand ?? sprites.punch;
  if (!stamp) return ["."];
  return locked ? stamp.rows.map((row) => row.replace(/[^.]/g, "K")) : stamp.rows;
}

export function AvatarEditor() {
  const user = useUser();
  const [draft, setDraft] = useState<Avatar | null>(null);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [demoOn, setDemoOn] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // 내 캐릭터를 읽어 오면 그 모습에서 시작한다
  useEffect(() => {
    if (user.avatar && !draft) setDraft(user.avatar);
  }, [user.avatar, draft]);

  if (!draft || !user.avatar) {
    return <div className="card avatar-editor skeleton-block tall" aria-busy="true" />;
  }

  const current = user.avatar;
  const changed = JSON.stringify(draft) !== JSON.stringify(current);
  const weapon = WEAPONS[draft.weapon];
  const update = (patch: Partial<Avatar>) => {
    setDraft({ ...draft, ...patch });
    setSaved(false);
    setNotice("");
  };

  function randomize() {
    const ownedIds = WEAPON_IDS.filter((id) => owns(user.ownedWeapons, id));
    update({
      headwear: pick(HEADWEARS),
      headwearColor: pick(AVATAR_COLORS)[0],
      outfit: pick(OUTFITS),
      outfitColor: pick(AVATAR_COLORS)[0],
      weapon: pick(ownedIds),
    });
  }

  function save() {
    if (!draft) return;
    user.setAvatar(draft);
    setSaved(true);
  }

  // 써 보기: 지금 고른 모습으로 옆의 별을 켜 본다 (관심 표시는 바뀌지 않는다)
  function tryStar(event: React.MouseEvent<HTMLButtonElement>) {
    if (demoOn) {
      setDemoOn(false);
      return;
    }
    const source = stageRef.current?.querySelector<SVGElement>("svg") ?? undefined;
    const coming = requestStarHelper(event.currentTarget, () => setDemoOn(true), { avatar: draft ?? undefined, source });
    if (!coming) setDemoOn(true);
  }

  const option = (key: string, label: string, on: boolean, onClick: () => void, picture: React.ReactNode, extra = "") => (
    <button key={key} type="button" className={`avatar-option ${on ? "on" : ""} ${extra}`} aria-pressed={on} aria-label={label} onClick={onClick}>
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
      {/* 미리보기 */}
      <section className="card avatar-stage-card">
        <div className="avatar-preview">
          <PixelSprite rows={actionRows(draft, "stand")} scale={6} />
          {weapon.effect && <AmbientEffect key={weapon.effect} effect={weapon.effect} every={weapon.grade === "rare" ? 2400 : 1400} />}
        </div>
        <p className="avatar-weapon-name">
          <span className={`grade grade-${weapon.grade}`}>{GRADE_NAMES[weapon.grade]}</span> {weapon.name}
        </p>
        {/* 써 보기: 작은 캐릭터와 별 */}
        <div className="avatar-try">
          <div ref={stageRef} className="avatar-try-pal" aria-hidden="true">
            <PixelSprite rows={actionRows(draft, "stand")} scale={2} />
          </div>
          <button type="button" className={`favorite avatar-try-star ${demoOn ? "on" : ""}`} aria-pressed={demoOn} aria-label="별 눌러 보기" onClick={tryStar}>
            <StarIcon filled={demoOn} />
          </button>
          <span className="avatar-try-hint">별을 눌러 보세요</span>
        </div>
      </section>

      <section className="card avatar-section">
        <h2 className="card-title">머리 장식</h2>
        <div className="avatar-options">
          {HEADWEARS.map((h) =>
            option(h, HEADWEAR_NAMES[h], draft.headwear === h, () => update({ headwear: h }), <PixelSprite rows={palRows({ ...draft, headwear: h }, "sit").slice(0, 12)} scale={3} />),
          )}
        </div>
        {swatches(draft.headwearColor, (color) => update({ headwearColor: color }), "머리 장식 색")}
      </section>

      <section className="card avatar-section">
        <h2 className="card-title">옷</h2>
        <div className="avatar-options">
          {OUTFITS.map((o) =>
            option(o, OUTFIT_NAMES[o], draft.outfit === o, () => update({ outfit: o }), <PixelSprite rows={palRows({ ...draft, outfit: o }, "sit")} scale={2} />),
          )}
        </div>
        {swatches(draft.outfitColor, (color) => update({ outfitColor: color }), "옷 색")}
      </section>

      <section className="card avatar-section">
        <h2 className="card-title">무기</h2>
        {GRADES.map((grade) => {
          const ids = WEAPON_IDS.filter((id) => WEAPONS[id].grade === grade);
          return (
            <div key={grade} className="avatar-weapon-group">
              <p className={`avatar-group-label grade-${grade}`}>{GRADE_NAMES[grade]}</p>
              <div className="avatar-options weapons">
                {ids.map((id) => {
                  const locked = !owns(user.ownedWeapons, id);
                  const label = locked ? `잠긴 ${GRADE_NAMES[grade]} 무기` : WEAPONS[id].name;
                  return option(
                    id,
                    label,
                    draft.weapon === id,
                    () => (locked ? setNotice("아직 얻지 못한 무기예요.") : update({ weapon: id })),
                    <>
                      <PixelSprite rows={weaponRows(id, locked)} scale={4} />
                      <span className="avatar-option-name">{locked ? "???" : WEAPONS[id].name}</span>
                      {locked && (
                        <span className="avatar-lock">
                          <LockIcon size={14} />
                        </span>
                      )}
                    </>,
                    `${locked ? "locked" : ""} grade-${grade}`,
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <div className="avatar-actions">
        <p className="avatar-notice" role="status">
          {notice || (saved && !changed ? "저장했어요. 이제 이 모습으로 같이 다녀요." : "")}
        </p>
        <button type="button" className="button" onClick={randomize}>
          랜덤
        </button>
        <button type="button" className="button" onClick={() => update(current)} disabled={!changed}>
          되돌리기
        </button>
        <button type="button" className="button primary" onClick={save} disabled={!changed}>
          저장
        </button>
      </div>
    </div>
  );
}
