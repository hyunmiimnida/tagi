"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRpc } from "../../lib/admin.ts";
import type { AdminStats } from "../../lib/admin.ts";
import type { SourceStatus } from "../../lib/data.ts";
import { useListPrograms, useSeriesInfo } from "../../lib/use-list.ts";
import type { SeriesInfo } from "../../lib/use-list.ts";
import { supabase, useUser } from "../../lib/user.tsx";
import { AdminComments } from "./AdminComments.tsx";
import { AdminDashboard } from "./AdminDashboard.tsx";
import { AdminFeedback } from "./AdminFeedback.tsx";
import { AdminLog } from "./AdminLog.tsx";
import { AdminNotices } from "./AdminNotices.tsx";
import { AdminReports } from "./AdminReports.tsx";
import { AdminUsers } from "./AdminUsers.tsx";

interface PageProps {
  schools: { id: string; shortName: string }[];
  collect: { ranAt: string | null; sources: SourceStatus[] };
}

export interface AdminContext extends PageProps {
  programTitles: Record<string, [title: string, id: string]>; // 공고 id(합쳐진 예전 id 포함) → [제목, 지금 id]
  seriesInfo: SeriesInfo;
}

const TABS = [
  { id: "dashboard", label: "대시보드" },
  { id: "users", label: "회원" },
  { id: "feedback", label: "의견함" },
  { id: "comments", label: "댓글" },
  { id: "reports", label: "정보 오류" },
  { id: "notices", label: "공지" },
  { id: "log", label: "기록" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

// 탭마다 처리할 일이 몇 개 남았는지 (탭 이름 옆 빨간 숫자)
function pending(stats: AdminStats | null, tab: TabId): number {
  if (!stats) return 0;
  if (tab === "feedback") return stats.newFeedback;
  if (tab === "comments") return stats.openReports;
  if (tab === "reports") return stats.openProgramReports;
  return 0;
}

export function AdminApp(props: PageProps) {
  const user = useUser();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [tab, setTabState] = useState<TabId>("dashboard");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [focusUser, setFocusUser] = useState<string | null>(null); // 다른 탭에서 "이 회원 보기"를 눌렀을 때

  // 신고·관심 공고·댓글의 id를 제목으로 보여 주려고 목록 데이터와 합쳐진 id 표를 받는다 (관리자일 때만)
  const { programs } = useListPrograms();
  const seriesInfo = useSeriesInfo(isAdmin === true);
  const [moved, setMoved] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/moved.json")
      .then((response) => (response.ok ? (response.json() as Promise<{ moved: Record<string, string> }>) : { moved: {} }))
      .then((data) => setMoved(data.moved))
      .catch(() => {});
  }, [isAdmin]);
  const context: AdminContext = useMemo(() => {
    const programTitles: AdminContext["programTitles"] = {};
    for (const p of programs ?? []) programTitles[p.id] = [p.title, p.id];
    for (const [from, to] of Object.entries(moved)) if (programTitles[to]) programTitles[from] = programTitles[to];
    return { ...props, programTitles, seriesInfo };
  }, [props, programs, moved, seriesInfo]);

  // 주소 끝(#users 등)으로 탭을 기억한다. 새로 고침해도 같은 탭이 열린다
  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.slice(1);
      if (TABS.some((t) => t.id === hash)) setTabState(hash as TabId);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const setTab = useCallback((next: TabId) => {
    setTabState(next);
    history.replaceState(null, "", `#${next}`);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!supabase || !user.userId) return setIsAdmin(null);
    void supabase.rpc("is_admin").then(({ data, error }) => {
      setSetupMissing(Boolean(error));
      setIsAdmin(error ? false : Boolean(data));
    });
  }, [user.userId]);

  const refreshStats = useCallback(async () => {
    const { data, error } = await adminRpc<AdminStats>("admin_stats");
    setStats(data);
    setStatsError(error);
  }, []);

  useEffect(() => {
    if (isAdmin) void refreshStats();
  }, [isAdmin, refreshStats]);

  const openUser = useCallback(
    (id: string) => {
      setFocusUser(id);
      setTab("users");
    },
    [setTab],
  );

  if (!user.loginEnabled) {
    return <Gate title="로그인이 설정되지 않았어요">Supabase 설정(.env.local)이 있어야 관리자 화면을 쓸 수 있어요.</Gate>;
  }
  if (!user.ready || (user.signedIn && isAdmin === null)) {
    return <Gate title="확인하는 중…" />;
  }
  if (!user.signedIn) {
    return (
      <Gate title="관리자 로그인">
        <p>관리자 계정으로 로그인해 주세요.</p>
        <button className="button primary wide" onClick={() => user.setLoginOpen(true)}>
          로그인
        </button>
      </Gate>
    );
  }
  if (!isAdmin) {
    return (
      <Gate title={setupMissing ? "관리 기능을 아직 켜지 않았어요" : "관리자만 볼 수 있어요"}>
        {setupMissing ? (
          <p>
            Supabase → SQL Editor에서 <code>supabase/admin.sql</code> 파일 내용을 전부 붙여 넣고 실행해 주세요. 자세한 방법은{" "}
            <code>docs/설정-안내.md</code>의 &ldquo;관리자 화면&rdquo;에 있어요.
          </p>
        ) : (
          <>
            <p>운영자라면: 이 계정을 관리자로 만들려면 Supabase → SQL Editor에서 아래 한 줄을 실행하고 이 화면을 새로 고쳐 주세요.</p>
            <pre className="admin-code">insert into admins (user_id) values (&apos;{user.userId}&apos;);</pre>
          </>
        )}
        <Link href="/" className="button wide">
          홈으로
        </Link>
      </Gate>
    );
  }

  return (
    <div className="admin">
      <div className="admin-head">
        <h1 className="page-title">관리자</h1>
        <button className="text-button" onClick={() => void refreshStats()}>
          새로 고침
        </button>
      </div>
      <nav className="chip-scroll admin-tabs" aria-label="관리 메뉴">
        {TABS.map((t) => {
          const count = pending(stats, t.id);
          return (
            <button
              key={t.id}
              className={`chip ${tab === t.id ? "active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {count > 0 && <span className="chip-count admin-badge">{count}</span>}
            </button>
          );
        })}
      </nav>

      {statsError && tab === "dashboard" && <p className="admin-error">{statsError}</p>}
      {tab === "dashboard" && <AdminDashboard stats={stats} context={context} goTo={setTab} />}
      {tab === "users" && <AdminUsers context={context} focus={focusUser} onFocused={() => setFocusUser(null)} onChange={refreshStats} />}
      {tab === "feedback" && <AdminFeedback onChange={refreshStats} openUser={openUser} />}
      {tab === "comments" && <AdminComments context={context} onChange={refreshStats} openUser={openUser} />}
      {tab === "reports" && <AdminReports context={context} onChange={refreshStats} />}
      {tab === "notices" && <AdminNotices />}
      {tab === "log" && <AdminLog openUser={openUser} />}
    </div>
  );
}

function Gate({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="card my-card admin-gate">
      <h1 className="card-title">{title}</h1>
      {children && <div className="admin-gate-body">{children}</div>}
    </section>
  );
}
