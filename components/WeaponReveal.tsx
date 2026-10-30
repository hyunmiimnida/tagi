"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "../lib/user.tsx";
import { WEAPON_SPRITES } from "../lib/weapon-sprites.ts";
import { DRAW_COST } from "../lib/gacha.ts";
import { WEAPONS, isWeaponId } from "../lib/weapons.ts";
import { PixelSprite } from "./PixelPal.tsx";

// 보물상자 뽑기 결과 (lib/user.tsx의 drawWeapon): 화면 가운데 보물상자가 흔들리다 열리고, 등급 빛(아우라)과 함께
// 실루엣이 진짜 무기(또는 전설의 파편)로 바뀌며 떠오른다. 이름·이야기, 이미 가진 무기면 돌려받은 열쇠조각,
// "장착하기"·"한 번 더"·"닫기". 동작 줄이기면 바로 마지막 장면.
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

type Stage = "shake" | "open" | "silhouette" | "reveal";

const silhouette = (rows: string[]) => rows.map((row) => row.replace(/[^.]/g, "B"));

function weaponRows(id: keyof typeof WEAPONS): string[] {
  const stamp = WEAPON_SPRITES[id].stand ?? WEAPON_SPRITES[id].punch;
  return stamp ? stamp.rows : ["."];
}

export function WeaponReveal() {
  const user = useUser();
  const { revealing, closeReveal, grantWeapon } = user;
  const [stage, setStage] = useState<Stage>("shake");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

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
    const first = stage === "reveal" ? dialogRef.current?.querySelector<HTMLButtonElement>("button") : null;
    (first ?? dialogRef.current)?.focus();
  }, [isOpen, stage]);

  if (!revealing) return null;
  const weapon = revealing.kind === "weapon" ? WEAPONS[revealing.weapon] : null;
  const grade = weapon ? weapon.grade : "legendary";
  const name = weapon ? weapon.name : SHARD_NAME;
  const rows = revealing.kind === "weapon" ? weaponRows(revealing.weapon) : SHARD;
  const shown = stage === "reveal";
  const canEquip = revealing.kind === "weapon" && user.avatar && user.avatar.weapon !== revealing.weapon;
  const canAgain = user.keys !== null && user.keys >= DRAW_COST;

  async function again() {
    setBusy(true);
    await user.drawWeapon();
    setBusy(false);
  }

  return (
    <div ref={dialogRef} tabIndex={-1} className="reveal-backdrop" role="dialog" aria-modal="true" aria-label={shown ? name : "보물상자"}>
      <div className={`reveal stage-${stage}`}>
        <div className={`reveal-light aura-${grade}`} aria-hidden="true" />
        {(stage === "silhouette" || stage === "reveal") && (
          <div className={`reveal-weapon aura aura-${grade}`} aria-hidden="true">
            <PixelSprite rows={stage === "silhouette" ? silhouette(rows) : rows} scale={7} />
          </div>
        )}
        <div className="reveal-chest" aria-hidden="true">
          <PixelSprite rows={stage === "shake" ? CHEST_CLOSED : CHEST_OPEN} scale={6} />
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
