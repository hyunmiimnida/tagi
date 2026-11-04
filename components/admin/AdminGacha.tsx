"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRpc } from "../../lib/admin-rpc.ts";
import { formatDateTime, GRADE_NAMES, gradeShares, groupIssues, ISSUE_KINDS, KEY_REASONS, PAGE_SIZE, sinceOf, tableProblems } from "../../lib/admin.ts";
import type { DrawRow, GachaStats, IntegrityResult, KeyLedgerRow, KeyReason, Page, Period } from "../../lib/admin.ts";
import type { DrawGrade } from "../../lib/gacha.ts";
import { isWeaponId, WEAPONS } from "../../lib/weapons.ts";

export const KEYS_SQL = "admin-keys.sql";

const PERIODS: [Period, string][] = [
  ["today", "오늘"],
  ["7", "7일"],
  ["30", "30일"],
  ["all", "전체"],
];

export const weaponName = (id: string | null) => (id === "shard" ? "전설의 파편" : id && isWeaponId(id) ? WEAPONS[id].name : (id ?? "-"));

// 뽑기 관리: 통계(설정 확률과 실제 비율 비교), 조작 점검, 열쇠조각·뽑기 기록
export function AdminGacha({ openUser }: { openUser: (id: string) => void }) {
  const [period, setPeriod] = useState<Period>("30");
  const since = sinceOf(period);
  return (
    <div className="my">
      <section className="card my-card">
        <div className="my-options">
          {PERIODS.map(([id, label]) => (
            <button key={id} className={`tag-option ${period === id ? "on" : ""}`} aria-pressed={period === id} onClick={() => setPeriod(id)}>
              {label}
            </button>
          ))}
        </div>
      </section>
      <GachaStatsCard since={since} />
      <IntegrityCard openUser={openUser} />
      <LogCard since={since} openUser={openUser} />
    </div>
  );
}

function GachaStatsCard({ since }: { since: string | null }) {
  const [stats, setStats] = useState<GachaStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void adminRpc<GachaStats>("admin_gacha_stats", { since }, KEYS_SQL).then((r) => {
      setStats(r.data);
      setError(r.error);
    });
  }, [since]);

  if (error) return <p className="admin-error">{error}</p>;
  if (!stats) return <p className="card-sub">불러오는 중…</p>;
  const given = Object.values(stats.today.given).reduce((n, v) => n + (v ?? 0), 0);
  const shares = gradeShares(stats.grades);
  const total = shares.reduce((n, s) => n + s.count, 0);
  return (
    <section className="card my-card">
      <h2 className="card-title">오늘</h2>
      <div className="admin-numbers">
        <Num label="준 열쇠조각" value={given} sub={describeGiven(stats.today.given)} />
        <Num label="회수" value={stats.today.revoked} />
        <Num label="뽑기" value={stats.today.draws} sub={`${stats.today.drawers}명`} />
        <Num label="남은 열쇠조각" value={stats.wallets.keys} sub={`${stats.wallets.people}명 · 파편 ${stats.wallets.shards}`} />
      </div>
      <h3 className="my-label">등급별 뽑기 ({total.toLocaleString("ko-KR")}번)</h3>
      <table className="admin-grid">
        <thead>
          <tr>
            <th>등급</th>
            <th>뽑기</th>
            <th>실제</th>
            <th>설정</th>
          </tr>
        </thead>
        <tbody>
          {shares.map((s) => (
            <tr key={s.grade}>
              <td>{GRADE_NAMES[s.grade]}</td>
              <td>{s.count.toLocaleString("ko-KR")}</td>
              <td>{s.actual === null ? "-" : `${percent(s.actual)}%`}</td>
              <td>{percent(s.expected)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(stats.grades.unknown ?? 0) > 0 && <p className="admin-meta">뽑기 목록에 없는 무기 {stats.grades.unknown}번 (목록에서 빠진 무기)</p>}
    </section>
  );
}

const percent = (value: number) => (value >= 1 ? value.toFixed(1) : value.toFixed(2));

function describeGiven(given: GachaStats["today"]["given"]): string | undefined {
  const parts = Object.entries(given)
    .filter(([, n]) => n)
    .map(([reason, n]) => `${KEY_REASONS[reason as KeyReason] ?? reason} ${n}`);
  return parts.length ? parts.join(" · ") : undefined;
}

function IntegrityCard({ openUser }: { openUser: (id: string) => void }) {
  const [result, setResult] = useState<IntegrityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    const r = await adminRpc<IntegrityResult>("admin_integrity_check", undefined, KEYS_SQL);
    setBusy(false);
    setResult(r.data);
    setError(r.error);
  }

  const people = result ? groupIssues(result.issues) : [];
  const tables = result ? tableProblems(result.tables) : [];
  return (
    <section className="card my-card">
      <h2 className="card-title">조작 점검</h2>
      <button className="button wide" disabled={busy} onClick={() => void check()}>
        {busy ? "점검하는 중…" : result ? "다시 점검" : "점검하기"}
      </button>
      {error && <p className="admin-error">{error}</p>}
      {result && (
        <>
          <p className="admin-meta admin-spaced">
            {formatDateTime(result.checked_at)} · {result.people.toLocaleString("ko-KR")}명 확인
          </p>
          {tables.length > 0 && (
            <p className="notice">
              {tables.map((t) => (
                <span key={t} className="admin-block">
                  {t}
                </span>
              ))}
            </p>
          )}
          {people.length === 0 ? (
            <p className="card-sub">규칙이 깨진 곳이 없어요.</p>
          ) : (
            <ul className="admin-list">
              {people.map((p) => (
                <li key={p.user_id}>
                  <div className="admin-line">
                    <button className="link-button" onClick={() => openUser(p.user_id)}>
                      <strong>{p.nickname}</strong>
                    </button>
                    {p.admin && <span className="row-school">관리자</span>}
                  </div>
                  {p.issues.map((issue, i) => (
                    <div key={i} className={`admin-meta ${issue.kind === "lucky" ? "" : "warn"}`}>
                      {ISSUE_KINDS[issue.kind] ?? issue.kind} · {issue.kind.endsWith("weapon") ? weaponName(issue.detail) : issue.detail}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

const LEDGER_FILTERS: (KeyReason | null)[] = [null, "admin_grant", "admin_revoke", "weapon_grant", "draw", "daily", "review", "review_undo", "welcome", "refund"];
const GRADE_FILTERS: (DrawGrade | null)[] = [null, "common", "rare", "heroic", "shard"];

function LogCard({ since, openUser }: { since: string | null; openUser: (id: string) => void }) {
  const [kind, setKind] = useState<"keys" | "draws">("keys");
  const [reason, setReason] = useState<KeyReason | null>(null);
  const [grade, setGrade] = useState<DrawGrade | null>(null);
  return (
    <section className="card my-card">
      <div className="admin-line">
        <h2 className="card-title">기록</h2>
        <div className="segmented" role="group" aria-label="기록 종류">
          <button className={kind === "keys" ? "on" : ""} onClick={() => setKind("keys")}>
            열쇠조각
          </button>
          <button className={kind === "draws" ? "on" : ""} onClick={() => setKind("draws")}>
            뽑기
          </button>
        </div>
      </div>
      <div className="my-options spaced">
        {kind === "keys"
          ? LEDGER_FILTERS.map((r) => (
              <button key={r ?? "all"} className={`tag-option ${reason === r ? "on" : ""}`} aria-pressed={reason === r} onClick={() => setReason(r)}>
                {r ? KEY_REASONS[r] : "전체"}
              </button>
            ))
          : GRADE_FILTERS.map((g) => (
              <button key={g ?? "all"} className={`tag-option ${grade === g ? "on" : ""}`} aria-pressed={grade === g} onClick={() => setGrade(g)}>
                {g ? GRADE_NAMES[g] : "전체"}
              </button>
            ))}
      </div>
      {kind === "keys" ? (
        <KeyLedger args={{ reason_filter: reason, since }} openUser={openUser} />
      ) : (
        <DrawLog args={{ grade_filter: grade, since }} openUser={openUser} />
      )}
    </section>
  );
}

// 30개씩 받고 "더 보기"로 이어 붙인다
function usePaged<T>(name: string, args: Record<string, unknown>) {
  const key = JSON.stringify(args);
  const [rows, setRows] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (offset: number) => {
      setBusy(true);
      const r = await adminRpc<Page<T>>(name, { ...JSON.parse(key), lim: PAGE_SIZE, off: offset }, KEYS_SQL);
      setBusy(false);
      setError(r.error);
      if (!r.data) return;
      setTotal(r.data.total);
      setRows((prev) => (offset === 0 ? r.data!.rows : [...(prev ?? []), ...r.data!.rows]));
    },
    [name, key],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  return { rows, total, error, busy, more: () => void load(rows?.length ?? 0) };
}

function More({ shown, total, busy, more }: { shown: number; total: number; busy: boolean; more: () => void }) {
  if (shown >= total) return null;
  return (
    <button className="button wide" disabled={busy} onClick={more}>
      {PAGE_SIZE}개 더 보기 ({shown}/{total})
    </button>
  );
}

export function KeyLedger({ args, openUser }: { args: Record<string, unknown>; openUser?: (id: string) => void }) {
  const { rows, total, error, busy, more } = usePaged<KeyLedgerRow>("admin_key_ledger", args);
  if (error) return <p className="admin-error">{error}</p>;
  if (!rows) return <p className="card-sub">불러오는 중…</p>;
  if (rows.length === 0) return <p className="card-sub">기록이 없어요.</p>;
  return (
    <>
      <ul className="admin-list">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="admin-line">
              <span>
                <strong className={r.change > 0 ? "admin-plus" : undefined}>
                  {r.change > 0 ? `+${r.change}` : r.change}
                </strong>{" "}
                {KEY_REASONS[r.reason] ?? r.reason}
              </span>
              <span className="admin-meta">남은 {r.balance}</span>
            </div>
            <div className="admin-meta">
              {openUser && (
                <>
                  <button className="link-button" onClick={() => openUser(r.user_id)}>
                    {r.nickname}
                  </button>{" "}
                  ·{" "}
                </>
              )}
              {formatDateTime(r.created_at)}
              {ledgerDetail(r) && ` · ${ledgerDetail(r)}`}
            </div>
          </li>
        ))}
      </ul>
      <More shown={rows.length} total={total} busy={busy} more={more} />
    </>
  );
}

function ledgerDetail(r: KeyLedgerRow): string | null {
  if (["draw", "refund", "weapon_grant", "weapon_revoke"].includes(r.reason)) return weaponName(r.detail);
  if (r.reason === "review" || r.reason === "review_undo") return `댓글 #${r.detail}${r.debt_paid ? ` · 빚 ${r.debt_paid}개 갚음` : ""}`;
  return r.detail;
}

export function DrawLog({ args, openUser }: { args: Record<string, unknown>; openUser?: (id: string) => void }) {
  const { rows, total, error, busy, more } = usePaged<DrawRow>("admin_draw_log", args);
  if (error) return <p className="admin-error">{error}</p>;
  if (!rows) return <p className="card-sub">불러오는 중…</p>;
  if (rows.length === 0) return <p className="card-sub">뽑기 기록이 없어요.</p>;
  return (
    <>
      <ul className="admin-list">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="admin-line">
              <span>
                <strong>{weaponName(r.weapon_id)}</strong> {r.grade && <span className="admin-tag">{GRADE_NAMES[r.grade]}</span>}
              </span>
              <span className="admin-meta">{r.duplicate ? `중복 · +${r.refund}` : r.grade === "shard" ? "" : "처음"}</span>
            </div>
            <div className="admin-meta">
              {openUser && (
                <>
                  <button className="link-button" onClick={() => openUser(r.user_id)}>
                    {r.nickname}
                  </button>{" "}
                  ·{" "}
                </>
              )}
              {formatDateTime(r.created_at)}
            </div>
          </li>
        ))}
      </ul>
      <More shown={rows.length} total={total} busy={busy} more={more} />
    </>
  );
}

function Num({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="admin-num">
      <span>{label}</span>
      <strong>{value.toLocaleString("ko-KR")}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}
