"use client";

import { useState } from "react";
import { DAILY_KEYS, DEMO_KEYS, DRAW_COST, REVIEW_DAILY_MAX, REVIEW_KEYS, WELCOME_KEYS } from "../lib/gacha.ts";
import { useUser } from "../lib/user.tsx";
import { KeyShardIcon } from "./KeyGiftToast.tsx";

// 보물상자 칸 (내 캐릭터 꾸미기 화면의 무기 도감 위): 열쇠조각 수, 다음 뽑기까지 남은 양, 열기 버튼, 모으는 방법.
// 결과는 components/WeaponReveal.tsx가 보여 준다. 확률은 화면에 공개하지 않는다 (lib/gacha.ts)

export function TreasureBox() {
  const user = useUser();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const keys = user.keys;

  async function open() {
    setBusy(true);
    setNotice("");
    const result = await user.drawWeapon();
    setBusy(false);
    if (result === "not-enough") setNotice(`열쇠조각이 ${DRAW_COST}개 있어야 열 수 있어요.`);
    if (result === "error") setNotice("상자를 열지 못했어요. 잠시 뒤 다시 해 주세요.");
  }

  let action: React.ReactNode;
  if (keys === null && user.loginEnabled && !user.signedIn) {
    action = (
      <button type="button" className="button primary" onClick={() => user.setLoginOpen(true)}>
        로그인하고 열쇠조각 모으기
      </button>
    );
  } else if (keys === null) {
    action = <p className="treasure-note">{user.ready ? "보물상자는 준비 중이에요." : ""}</p>;
  } else {
    action = (
      <button type="button" className="button primary" disabled={busy || keys < DRAW_COST} onClick={open}>
        보물상자 열기 · 열쇠조각 {DRAW_COST}개
      </button>
    );
  }

  return (
    <section className="card treasure" aria-label="보물상자">
      <div className="treasure-head">
        <h2 className="card-title">보물상자</h2>
        {keys !== null && (
          <span className="treasure-keys" aria-label={`열쇠조각 ${keys}개`}>
            <KeyShardIcon /> {keys}
          </span>
        )}
      </div>
      {keys !== null && (
        <div className="treasure-meter" aria-hidden="true">
          <i style={{ width: `${keys >= DRAW_COST ? 100 : (keys / DRAW_COST) * 100}%` }} />
        </div>
      )}
      {keys !== null && (
        <p className="treasure-note">
          {keys >= DRAW_COST ? `${Math.floor(keys / DRAW_COST)}번 열 수 있어요` : `${DRAW_COST - keys}개 더 모으면 열 수 있어요`}
          {user.legendShards > 0 && ` · 전설의 파편 ${user.legendShards}개`}
        </p>
      )}
      {action}
      {notice && (
        <p className="avatar-notice" role="status">
          {notice}
        </p>
      )}
      {user.loginEnabled ? (
        <ul className="treasure-ways">
          <li>처음 오면 · 열쇠조각 {WELCOME_KEYS}개</li>
          <li>매일 첫 접속 · {DAILY_KEYS}개</li>
          <li>
            후기 남기기 · {REVIEW_KEYS}개 (하루 {REVIEW_DAILY_MAX}번까지)
          </li>
          <li>이미 가진 무기가 나오면 열쇠조각 일부를 돌려받아요</li>
        </ul>
      ) : (
        <p className="treasure-ways">체험 모드라 모든 무기가 열려 있고, 열쇠조각은 들어올 때마다 {DEMO_KEYS}개로 채워져요.</p>
      )}
    </section>
  );
}
