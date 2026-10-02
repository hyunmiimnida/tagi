"use client";

import { useState } from "react";
import { formatDateTime, sourceProblems, timeAgo } from "../../lib/admin.ts";
import type { AdminStats } from "../../lib/admin.ts";
import type { AdminContext, TabId } from "./AdminApp.tsx";

const STALE_DAYS = 3; // 이보다 오래 성공하지 못한 출처는 빨갛게

interface Props {
  stats: AdminStats | null;
  context: AdminContext;
  goTo: (tab: TabId) => void;
}

// 대시보드: 처리할 일, 회원·활동 숫자, 최근 14일 가입자, 출처별 수집 상태
export function AdminDashboard({ stats, context, goTo }: Props) {
  const { collect, schools } = context;
  const [allSources, setAllSources] = useState(false);
  const now = Date.now();
  const problems = sourceProblems(collect.sources, now, STALE_DAYS);

  const todo = stats
    ? [
        { label: "새 의견", count: stats.newFeedback, tab: "feedback" as const },
        { label: "확인할 댓글 신고", count: stats.openReports, tab: "comments" as const },
        { label: "정보 오류 신고", count: stats.openProgramReports, tab: "reports" as const },
      ]
    : [];

  return (
    <div className="my">
      <section className="card my-card">
        <h2 className="card-title">처리할 일</h2>
        {!stats ? (
          <p className="card-sub">불러오는 중…</p>
        ) : todo.every((t) => t.count === 0) ? (
          <p className="card-sub">지금 처리할 일이 없어요.</p>
        ) : null}
        {stats && (
          <div className="hero-stats">
            {todo.map((t) => (
              <button key={t.tab} type="button" className="stat" onClick={() => goTo(t.tab)}>
                <span>{t.label}</span>
                <strong className={t.count > 0 ? "warn" : ""}>{t.count}</strong>
              </button>
            ))}
          </div>
        )}
      </section>

      {stats && (
        <section className="card my-card">
          <h2 className="card-title">회원과 활동</h2>
          <div className="admin-numbers">
            <Num label="전체 회원" value={stats.users} onClick={() => goTo("users")} />
            <Num label="7일 새 회원" value={stats.new7} />
            <Num label="7일 접속" value={stats.active7} />
            <Num label="이용 정지" value={stats.suspended} warn={stats.suspended > 0} />
            <Num label="관심 표시" value={stats.favorites} sub={`${stats.favoriteUsers}명`} />
            <Num label="마감 알림 켬" value={stats.notify} sub={`기기 ${stats.devices}대`} />
            <Num label="댓글" value={stats.comments} sub={`7일 ${stats.comments7}개`} />
            <Num label="숨긴 댓글" value={stats.hidden} />
          </div>
          <SignupChart days={stats.signups} />
          <Breakdown
            title="회원 학교"
            rows={Object.entries(stats.schools).map(([id, n]) => [schools.find((s) => s.id === id)?.shortName ?? (id ? id : "안 고름"), n])}
          />
          <Breakdown title="회원 신분" rows={Object.entries(stats.statuses).map(([s, n]) => [s || "안 고름", n])} />
        </section>
      )}

      <section className="card my-card">
        <h2 className="card-title">수집 상태</h2>
        <p className="card-sub">
          마지막 수집 {formatDateTime(collect.ranAt)} · 사이트를 빌드할 때의 기록이에요 (수집하면 자동으로 다시 빌드돼요).
        </p>
        {problems.length > 0 && <p className="notice">살펴볼 출처 {problems.length}곳: 실패했거나 {STALE_DAYS}일 넘게 성공하지 못했어요.</p>}
        {problems.length === 0 && <p className="card-sub">출처 {collect.sources.filter((s) => s.enabled).length}곳 모두 잘 수집하고 있어요.</p>}
        <ul className="admin-list admin-sources">
          {[...collect.sources]
            .filter((s) => allSources || problems.includes(s))
            .sort((a, b) => Number(problems.includes(b)) - Number(problems.includes(a)))
            .map((s) => {
              const bad = problems.includes(s);
              return (
                <li key={s.id} className={!s.enabled ? "off" : undefined}>
                  <div className="admin-line">
                    <strong className={bad ? "warn" : undefined}>{s.name}</strong>
                    <span className="admin-meta">
                      {!s.enabled ? "꺼짐" : s.localOnly ? "내 컴퓨터" : "자동"}
                    </span>
                  </div>
                  {s.enabled && (
                    <div className="admin-meta">
                      마지막 성공 {timeAgo(s.lastSuccessAt)}
                      {s.count !== null && ` · 새 글 ${s.count}개`}
                      {s.failStreak > 0 && <span className="warn"> · {s.failStreak}번 연속 실패</span>}
                      {s.message && ` · ${s.message}`}
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
        <button className="button wide" onClick={() => setAllSources((v) => !v)}>
          {allSources ? "살펴볼 출처만 보기" : `전체 출처 ${collect.sources.length}곳 보기`}
        </button>
      </section>
    </div>
  );
}

function Num({ label, value, sub, warn, onClick }: { label: string; value: number; sub?: string; warn?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span>{label}</span>
      <strong className={warn ? "warn" : undefined}>{value.toLocaleString("ko-KR")}</strong>
      {sub && <small>{sub}</small>}
    </>
  );
  return onClick ? (
    <button type="button" className="admin-num" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="admin-num">{body}</div>
  );
}

// 최근 14일 가입자 막대 (하나의 값이라 범례 없이 제목이 이름을 대신한다. 막대에 손을 올리면 날짜·수)
function SignupChart({ days }: { days: { day: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  return (
    <figure className="admin-chart">
      <figcaption>
        최근 14일 가입 <strong>{total}명</strong>
      </figcaption>
      <div className="admin-bars" role="img" aria-label={`최근 14일 가입자: ${days.map((d) => `${d.day.slice(5)} ${d.count}명`).join(", ")}`}>
        {days.map((d) => (
          <div key={d.day} className="admin-bar" title={`${d.day.slice(5).replace("-", ".")} ${d.count}명`}>
            <span style={{ height: `${(d.count / max) * 100}%` }} className={d.count === 0 ? "zero" : undefined} />
          </div>
        ))}
      </div>
      <div className="admin-bars-axis">
        <span>{days[0]?.day.slice(5).replace("-", ".")}</span>
        <span>오늘</span>
      </div>
    </figure>
  );
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b[1] - a[1]);
  return (
    <>
      <h3 className="my-label">{title}</h3>
      <div className="my-options">
        {sorted.map(([name, n]) => (
          <span key={name} className="tag-option">
            {name} <span>{n}</span>
          </span>
        ))}
      </div>
    </>
  );
}
