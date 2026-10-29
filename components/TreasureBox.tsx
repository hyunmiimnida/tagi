"use client";

import { useState } from "react";
import { DAILY_KEYS, DRAW_COST, ODDS, REFUND, REVIEW_DAILY_MAX, REVIEW_KEYS, oddsPercent } from "../lib/gacha.ts";
import type { DrawGrade } from "../lib/gacha.ts";
import { useUser } from "../lib/user.tsx";
import { KeyShardIcon } from "./KeyGiftToast.tsx";

// 보물상자 칸 (내 캐릭터 꾸미기 화면의 무기 도감 위): 열쇠조각 수, 다음 뽑기까지 남은 양, 열기 버튼, 모으는 방법과 확률.
// 결과는 components/WeaponReveal.tsx가 보여 준다. 확률은 숨기지 않는다
const GRADE_LABELS: Record<DrawGrade, string> = { common: "일반 무기", rare: "희귀 무기", heroic: "영웅 무기", shard: "전설의 파편" };

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
      <ul className="treasure-ways">
        <li>매일 첫 접속 · 열쇠조각 {DAILY_KEYS}개</li>
        <li>
          후기 남기기 · {REVIEW_KEYS}개 (하루 {REVIEW_DAILY_MAX}번까지)
        </li>
      </ul>
      <details className="treasure-odds">
        <summary>확률 보기</summary>
        <ul>
          {ODDS.map(([grade, weight]) => (
            <li key={grade}>
              <span>{GRADE_LABELS[grade]}</span>
              <span>{oddsPercent(weight)}</span>
            </li>
          ))}
        </ul>
        <p>
          같은 등급 안에서는 모두 같은 확률이에요. 이미 가진 무기가 나오면 열쇠조각을 돌려받아요 (일반 {REFUND.common}개, 희귀 {REFUND.rare}개, 영웅 {REFUND.heroic}개).
          전설의 파편은 모아 두면 나중에 보상으로 바꿀 수 있어요.
        </p>
      </details>
    </section>
  );
}
