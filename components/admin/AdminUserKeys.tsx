"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRpc } from "../../lib/admin-rpc.ts";
import type { UserKeys } from "../../lib/admin.ts";
import { DRAW_POOL } from "../../lib/gacha.ts";
import { DrawLog, KEYS_SQL, KeyLedger, weaponName } from "./AdminGacha.tsx";

const POOL = [...DRAW_POOL.common, ...DRAW_POOL.rare, ...DRAW_POOL.heroic, ...DRAW_POOL.legendary];
const SOURCES = { draw: "뽑기", admin: "관리자 지급", none: "기록 없음" } as const;

// 회원 자세히 안의 열쇠조각·무기: 지급·회수(이유 필수, 확인 창), 가진 무기와 얻은 경로, 기록
export function AdminUserKeys({ id, nickname }: { id: string; nickname: string }) {
  const [data, setData] = useState<UserKeys | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [weapon, setWeapon] = useState("");
  const [log, setLog] = useState<"keys" | "draws">("keys");
  const [version, setVersion] = useState(0); // 바꾼 뒤 기록도 다시 읽게

  const load = useCallback(async () => {
    const r = await adminRpc<UserKeys>("admin_user_keys", { target: id }, KEYS_SQL);
    setData(r.data);
    setError(r.error);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(name: string, args: Record<string, unknown>, done: (result: unknown) => string, ask: string) {
    if (busy || !window.confirm(ask)) return;
    setBusy(true);
    const r = await adminRpc(name, { target: id, why: reason.trim(), ...args }, KEYS_SQL);
    setBusy(false);
    setMessage(r.error ?? done(r.data));
    if (!r.error) {
      setAmount("");
      setReason("");
      setWeapon("");
      setVersion((v) => v + 1);
      void load();
    }
  }

  if (error) return <p className="admin-error">{error}</p>;
  if (!data) return null;

  const count = Number(amount);
  const amountOk = Number.isInteger(count) && count >= 1 && count <= 10000;
  const reasonOk = reason.trim().length > 0;
  const owned = new Set(data.weapons.map((w) => w.weapon_id));

  return (
    <section className="card my-card">
      <h2 className="card-title">열쇠조각·무기</h2>
      <dl className="admin-facts">
        <dt>열쇠조각</dt>
        <dd>
          <strong>{data.keys.toLocaleString("ko-KR")}개</strong>
          {data.debt > 0 && ` · 못 돌려받은 양 ${data.debt}개`}
        </dd>
        <dt>전설의 파편</dt>
        <dd>{data.shards}개</dd>
        <dt>뽑기</dt>
        <dd>{data.draws}번</dd>
        <dt>마지막 접속 선물</dt>
        <dd>{data.last_daily ?? "-"}</dd>
      </dl>

      {message && (
        <p className="nickname-note" role="status">
          {message}
        </p>
      )}
      <div className="nickname-row admin-spaced">
        <input
          inputMode="numeric"
          value={amount}
          placeholder="개수 (1~10000)"
          aria-label="열쇠조각 개수"
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      <div className="nickname-row admin-spaced">
        <input value={reason} maxLength={200} placeholder="이유 (꼭 적어요, 관리 기록에 남아요)" aria-label="이유" onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="admin-actions admin-spaced">
        <button
          className="button small"
          disabled={busy || !amountOk || !reasonOk}
          onClick={() =>
            void run("admin_grant_keys", { amount: count }, () => `${count}개를 줬어요.`, `${nickname}에게 열쇠조각 ${count}개를 줄까요?`)
          }
        >
          지급
        </button>
        <button
          className="button small"
          disabled={busy || !amountOk || !reasonOk}
          onClick={() =>
            void run(
              "admin_revoke_keys",
              { amount: count },
              (result) => {
                const { taken, short } = result as { taken: number; short: number };
                return short > 0 ? `${taken}개만 회수했어요. 남은 열쇠조각이 ${short}개 모자랐어요.` : `${taken}개를 회수했어요.`;
              },
              `${nickname}의 열쇠조각 ${count}개를 회수할까요? (남은 만큼만 가져가요)`,
            )
          }
        >
          회수
        </button>
      </div>

      <h3 className="my-label">가진 무기 {data.weapons.length}개</h3>
      {data.weapons.length === 0 ? (
        <p className="card-sub">맨손뿐이에요.</p>
      ) : (
        <ul className="admin-list">
          {data.weapons.map((w) => (
            <li key={w.weapon_id} className="admin-line">
              <span>
                {weaponName(w.weapon_id)} <span className={`admin-tag ${w.source === "none" ? "warn" : ""}`}>{SOURCES[w.source]}</span>
              </span>
              <button
                className="text-button"
                disabled={busy || !reasonOk}
                title={reasonOk ? undefined : "위에 이유를 먼저 적어요"}
                onClick={() =>
                  void run("admin_revoke_weapon", { weapon: w.weapon_id }, () => "무기를 회수했어요.", `${weaponName(w.weapon_id)}을(를) 회수할까요?`)
                }
              >
                회수
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="nickname-row admin-spaced">
        <select value={weapon} aria-label="줄 무기" onChange={(e) => setWeapon(e.target.value)}>
          <option value="">줄 무기 고르기</option>
          {POOL.filter((w) => !owned.has(w)).map((w) => (
            <option key={w} value={w}>
              {weaponName(w)}
            </option>
          ))}
        </select>
        <button
          className="button small"
          disabled={busy || !weapon || !reasonOk}
          onClick={() => void run("admin_grant_weapon", { weapon }, () => "무기를 줬어요.", `${nickname}에게 ${weaponName(weapon)}을(를) 줄까요?`)}
        >
          무기 지급
        </button>
      </div>

      <div className="admin-line admin-spaced">
        <h3 className="my-label">기록</h3>
        <div className="segmented" role="group" aria-label="기록 종류">
          <button className={log === "keys" ? "on" : ""} onClick={() => setLog("keys")}>
            열쇠조각
          </button>
          <button className={log === "draws" ? "on" : ""} onClick={() => setLog("draws")}>
            뽑기
          </button>
        </div>
      </div>
      {log === "keys" ? <KeyLedger key={version} args={{ target: id }} /> : <DrawLog key={version} args={{ target: id }} />}
    </section>
  );
}
