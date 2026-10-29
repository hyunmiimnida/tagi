"use client";

import { useEffect, useState } from "react";
import { useUser } from "../lib/user.tsx";
import { WEAPON_SPRITES } from "../lib/weapon-sprites.ts";
import { WEAPONS, isWeaponId } from "../lib/weapons.ts";
import type { WeaponDef } from "../lib/weapons.ts";
import { PixelSprite } from "./PixelPal.tsx";

// 무기를 얻는 순간 (lib/user.tsx의 grantWeapon): 화면 가운데 보물상자가 흔들리다 열리고, 등급 빛(아우라)과 함께
// 실루엣이 진짜 무기로 바뀌며 떠오른다. 이름·이야기와 "장착하기"·"닫기". 동작 줄이기면 바로 마지막 장면.
// 내 컴퓨터에서 시험할 때(npm run dev)는 주소 끝에 ?reveal=무기id 를 붙이면 연출을 볼 수 있다

// 보물상자 (20×14): 닫힘·열림
const CHEST_CLOSED = [
  "....KKKKKKKKKKKK....",
  "...KTTTTTTTTTTTTK...",
  "..KTtTTTTTTTTTTtTK..",
  "..KTTTTTTTTTTTTTTK..",
  "..KYYYYYYYYYYYYYYK..",
  "..KGGGGGGKKGGGGGGK..",
  "..KTTTTTTKYKTTTTTK..",
  "..KTtTTTTKGKTTTtTK..",
  "..KTTTTTTTKTTTTTTK..",
  "..KTTTTTTTTTTTTTTK..",
  "..KYYYYYYYYYYYYYYK..",
  "..KTtTTTTTTTTTTtTK..",
  "..KTTTTTTTTTTTTTTK..",
  "..KKKKKKKKKKKKKKKK..",
];
const CHEST_OPEN = [
  "....KKKKKKKKKKKK....",
  "...KTTTTTTTTTTTTK...",
  "..KTtTTTTTTTTTTtTK..",
  "..KYYYYYYYYYYYYYYK..",
  "..KKKKKKKKKKKKKKKK..",
  "..KEEEEEEEEEEEEEEK..",
  "..KEWWWWWWWWWWWWEK..",
  "..KGGGGGGGGGGGGGGK..",
  "..KTTTTTTTTTTTTTTK..",
  "..KTtTTTTTTTTTTtTK..",
  "..KYYYYYYYYYYYYYYK..",
  "..KTtTTTTTTTTTTtTK..",
  "..KTTTTTTTTTTTTTTK..",
  "..KKKKKKKKKKKKKKKK..",
];

type Stage = "shake" | "open" | "silhouette" | "reveal";

function weaponRows(id: keyof typeof WEAPONS, silhouette: boolean): string[] {
  const stamp = WEAPON_SPRITES[id].stand ?? WEAPON_SPRITES[id].punch;
  if (!stamp) return ["."];
  return silhouette ? stamp.rows.map((row) => row.replace(/[^.]/g, "B")) : stamp.rows;
}

export function WeaponReveal() {
  const user = useUser();
  const { revealing, closeReveal, grantWeapon } = user;
  const [stage, setStage] = useState<Stage>("shake");

  // 시험용: 내 컴퓨터(npm run dev)에서 ?reveal=무기id
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const id = new URLSearchParams(window.location.search).get("reveal");
    if (id && isWeaponId(id)) grantWeapon(id);
  }, [grantWeapon]);

  useEffect(() => {
    if (!revealing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage("reveal");
      return;
    }
    setStage("shake");
    const timers = [setTimeout(() => setStage("open"), 1000), setTimeout(() => setStage("silhouette"), 1250), setTimeout(() => setStage("reveal"), 1750)];
    return () => timers.forEach(clearTimeout);
  }, [revealing]);

  if (!revealing) return null;
  const weapon: WeaponDef = WEAPONS[revealing];
  const shown = stage === "reveal";

  return (
    <div className="reveal-backdrop" role="dialog" aria-modal="true" aria-label={shown ? `새 무기 ${weapon.name}` : "새 무기"}>
      <div className={`reveal stage-${stage}`}>
        <div className={`reveal-light aura-${weapon.grade}`} aria-hidden="true" />
        {(stage === "silhouette" || stage === "reveal") && (
          <div className={`reveal-weapon aura aura-${weapon.grade}`} aria-hidden="true">
            <PixelSprite rows={weaponRows(revealing, stage === "silhouette")} scale={7} />
          </div>
        )}
        <div className="reveal-chest" aria-hidden="true">
          <PixelSprite rows={stage === "shake" ? CHEST_CLOSED : CHEST_OPEN} scale={6} />
        </div>
        <div className="reveal-text" aria-live="polite">
          {shown && (
            <>
              <p className="reveal-name">{weapon.name}</p>
              <p className="reveal-flavor">{weapon.flavor}</p>
              <div className="reveal-actions">
                <button type="button" className="button" onClick={closeReveal}>
                  닫기
                </button>
                {user.avatar && (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      if (user.avatar) user.setAvatar({ ...user.avatar, weapon: revealing });
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
