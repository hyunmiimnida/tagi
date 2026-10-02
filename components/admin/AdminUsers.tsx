"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminRpc } from "../../lib/admin-rpc.ts";
import { formatDateTime, PAGE_SIZE, PROVIDER_NAMES, FEEDBACK_STATUS, timeAgo } from "../../lib/admin.ts";
import type { AdminUser, AdminUserDetail, Page } from "../../lib/admin.ts";
import type { AdminContext } from "./AdminApp.tsx";
import { ChevronIcon } from "../Icons.tsx";

const VIEWS = [
  { id: "all", label: "전체" },
  { id: "new", label: "7일 새 회원" },
  { id: "commenters", label: "댓글 쓴 사람" },
  { id: "suspended", label: "정지" },
  { id: "admins", label: "관리자" },
];

interface Props {
  context: AdminContext;
  focus: string | null; // 처음부터 열어 둘 회원
  onFocused: () => void;
  onChange: () => void; // 숫자가 바뀌는 일을 했을 때 (대시보드 다시 읽기)
}

// 회원 관리: 찾기·보기 → 한 명 자세히 → 정지·닉네임 지우기·댓글 숨기기·강제 탈퇴
export function AdminUsers({ context, focus, onFocused, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [view, setView] = useState("all");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<AdminUser> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(focus);

  useEffect(() => {
    if (focus) {
      setSelected(focus);
      onFocused();
    }
  }, [focus, onFocused]);

  const load = useCallback(async () => {
    const result = await adminRpc<Page<AdminUser>>("admin_users", { q: submitted, mode: view, lim: PAGE_SIZE, off: page * PAGE_SIZE });
    setData(result.data);
    setError(result.error);
  }, [submitted, view, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const schoolName = (id: string | null) => (id ? (context.schools.find((s) => s.id === id)?.shortName ?? id) : null);

  if (selected) {
    return (
      <UserDetail
        id={selected}
        context={context}
        schoolName={schoolName}
        onBack={() => {
          setSelected(null);
          void load();
        }}
        onChange={onChange}
      />
    );
  }

  return (
    <div className="my">
      <section className="card my-card">
        <form
          className="nickname-row"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(0);
            setSubmitted(query.trim());
          }}
        >
          <input value={query} placeholder="이메일·닉네임·계정 번호로 찾기" aria-label="회원 찾기" onChange={(e) => setQuery(e.target.value)} />
          <button className="button small">찾기</button>
        </form>
        <div className="my-options spaced">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`tag-option ${view === v.id ? "on" : ""}`}
              aria-pressed={view === v.id}
              onClick={() => {
                setPage(0);
                setView(v.id);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="admin-error">{error}</p>}
      {data && (
        <section className="card admin-table">
          <p className="admin-count">
            {submitted && `"${submitted}" `}
            {data.total.toLocaleString("ko-KR")}명
          </p>
          {data.rows.length === 0 ? (
            <p className="section-empty">해당하는 회원이 없어요.</p>
          ) : (
            <ul className="rows">
              {data.rows.map((u) => (
                <li key={u.id} className="row admin-row" onClick={() => setSelected(u.id)}>
                  <div className="row-body">
                    <div className="row-meta">
                      {u.admin && <span className="row-school">관리자</span>}
                      {u.suspended && <span className="admin-tag warn">정지</span>}
                      <span>{PROVIDER_NAMES[u.provider ?? ""] ?? u.provider ?? "-"}</span>
                      {schoolName(u.school_id) && <span>· {schoolName(u.school_id)}</span>}
                      {u.status && <span>· {u.status}</span>}
                    </div>
                    <button className="row-title admin-row-title">{u.nickname ?? "닉네임 없음"}</button>
                    <div className="admin-meta">
                      {u.email ?? "이메일 없음"} · 가입 {formatDateTime(u.created_at).split(" ")[0]} · 접속 {timeAgo(u.last_sign_in_at)}
                    </div>
                    <div className="admin-meta">
                      관심 {u.favorites} · 댓글 {u.comments}
                      {u.notify && " · 알림 켬"}
                    </div>
                  </div>
                  <ChevronIcon size={18} />
                </li>
              ))}
            </ul>
          )}
          <Pager page={page} total={data.total} onPage={setPage} />
        </section>
      )}
    </div>
  );
}

export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const last = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  if (last === 0) return null;
  return (
    <div className="admin-pager">
      <button className="button small" disabled={page === 0} onClick={() => onPage(page - 1)}>
        이전
      </button>
      <span>
        {page + 1} / {last + 1}
      </span>
      <button className="button small" disabled={page >= last} onClick={() => onPage(page + 1)}>
        다음
      </button>
    </div>
  );
}

interface DetailProps {
  id: string;
  context: AdminContext;
  schoolName: (id: string | null) => string | null;
  onBack: () => void;
  onChange: () => void;
}

function UserDetail({ id, context, schoolName, onBack, onChange }: DetailProps) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suspendDays, setSuspendDays] = useState<number | null>(7);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const result = await adminRpc<AdminUserDetail>("admin_user_detail", { target: id });
    setUser(result.data);
    setError(result.error ?? (result.data ? null : "없는 회원이에요. 이미 탈퇴했을 수 있어요."));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(name: string, args: Record<string, unknown>, done: string) {
    setBusy(true);
    const result = await adminRpc(name, args);
    setBusy(false);
    setMessage(result.error ?? done);
    if (!result.error) {
      onChange();
      if (name === "admin_delete_user") return onBack();
      void load();
    }
  }

  if (error && !user) {
    return (
      <div className="my">
        <BackButton onBack={onBack} />
        <p className="admin-error">{error}</p>
      </div>
    );
  }
  if (!user) return <p className="card-sub">불러오는 중…</p>;

  const suspension = user.suspension?.active ? user.suspension : null;
  const titleOf = (programId: string) => context.programTitles[programId];

  return (
    <div className="my">
      <BackButton onBack={onBack} />

      <section className="card my-card">
        <div className="my-identity">
          <div className="my-avatar" aria-hidden="true">
            {user.nickname?.slice(0, 1) ?? "?"}
          </div>
          <div className="my-identity-text">
            <strong>
              {user.nickname ?? "닉네임 없음"} {user.admin && <span className="row-school">관리자</span>}
            </strong>
            <span>
              {PROVIDER_NAMES[user.provider ?? ""] ?? user.provider ?? "-"} · {user.email ?? "이메일 없음"}
            </span>
          </div>
        </div>
        {suspension && (
          <p className="notice">
            이용 정지 중 ({suspension.until ? `${formatDateTime(suspension.until)}까지` : "영구"})
            {suspension.reason && ` · ${suspension.reason}`}
          </p>
        )}
        <dl className="admin-facts">
          <dt>가입</dt>
          <dd>{formatDateTime(user.created_at)}</dd>
          <dt>마지막 접속</dt>
          <dd>{formatDateTime(user.last_sign_in_at)}</dd>
          <dt>학교</dt>
          <dd>{schoolName(user.school_id) ?? "안 고름"}</dd>
          <dt>신분·학년</dt>
          <dd>{[user.status, user.grade].filter(Boolean).join(" ") || "안 고름"}</dd>
          <dt>관심 분야</dt>
          <dd>{user.interests.length ? user.interests.join(", ") : "안 고름"}</dd>
          <dt>마감 알림</dt>
          <dd>{user.notify ? `켬 (기기 ${user.devices}대)` : "끔"}</dd>
          <dt>댓글 규칙 동의</dt>
          <dd>{user.rules_agreed_at ? formatDateTime(user.rules_agreed_at) : "안 함"}</dd>
          <dt>받은 신고</dt>
          <dd className={user.reportsReceived > 0 ? "warn" : undefined}>{user.reportsReceived}건</dd>
          <dt>한 신고</dt>
          <dd>{user.reportsMade}건</dd>
          <dt>이 사람을 숨긴 사람</dt>
          <dd>{user.blockedBy}명</dd>
          <dt>계정 번호</dt>
          <dd className="admin-mono">{user.id}</dd>
        </dl>
      </section>

      {!user.admin && (
        <section className="card my-card">
          <h2 className="card-title">관리</h2>
          {message && (
            <p className="nickname-note" role="status">
              {message}
            </p>
          )}

          <h3 className="my-label">이용 정지 (댓글·의견 쓰기 막기)</h3>
          {suspension ? (
            <button className="button wide" disabled={busy} onClick={() => run("admin_unsuspend", { target: id }, "정지를 풀었어요.")}>
              정지 풀기
            </button>
          ) : (
            <>
              <div className="my-options">
                {[
                  [1, "1일"],
                  [7, "7일"],
                  [30, "30일"],
                  [null, "영구"],
                ].map(([days, label]) => (
                  <button
                    key={String(label)}
                    className={`tag-option ${suspendDays === days ? "on" : ""}`}
                    aria-pressed={suspendDays === days}
                    onClick={() => setSuspendDays(days as number | null)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="nickname-row admin-spaced">
                <input value={reason} maxLength={200} placeholder="정지 이유 (본인에게는 보이지 않아요)" onChange={(e) => setReason(e.target.value)} />
              </div>
              <button
                className="button wide"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`${suspendDays ? `${suspendDays}일` : "영구"} 정지할까요?`)) return;
                  void run("admin_suspend", { target: id, days: suspendDays, why: reason.trim() }, "정지했어요.");
                  setReason("");
                }}
              >
                정지하기
              </button>
            </>
          )}

          <div className="my-row">
            <span>
              <strong>닉네임 지우기</strong>
              <small>욕설·실명·흉내 내는 닉네임일 때. 댓글에 &ldquo;익명&rdquo;으로 보여요.</small>
            </span>
            <button
              className="button small"
              disabled={busy || !user.nickname}
              onClick={() => window.confirm("닉네임을 지울까요?") && run("admin_reset_nickname", { target: id }, "닉네임을 지웠어요.")}
            >
              지우기
            </button>
          </div>
          <div className="my-row">
            <span>
              <strong>댓글 모두 숨기기</strong>
              <small>도배·광고 계정 정리. 숨긴 댓글은 본인에게만 보여요.</small>
            </span>
            <button
              className="button small"
              disabled={busy || user.comments.every((c) => c.hidden)}
              onClick={() => window.confirm("이 사람의 댓글을 모두 숨길까요?") && run("admin_hide_user_comments", { target: id }, "댓글을 모두 숨겼어요.")}
            >
              숨기기
            </button>
          </div>
          <div className="my-row">
            <span>
              <strong className="warn">강제 탈퇴</strong>
              <small>계정과 관심 공고·댓글·의견이 모두 지워지고 되돌릴 수 없어요.</small>
            </span>
            <button
              className="button small admin-danger"
              disabled={busy}
              onClick={() => {
                const why = window.prompt("강제 탈퇴할까요? 이유를 적고 확인을 누르면 바로 지워져요.");
                if (why !== null) void run("admin_delete_user", { target: id, why: why.trim() }, "탈퇴시켰어요.");
              }}
            >
              탈퇴
            </button>
          </div>
        </section>
      )}

      <section className="card my-card">
        <h2 className="card-title">댓글 {user.comments.length}개</h2>
        {user.comments.length === 0 ? (
          <p className="card-sub">쓴 댓글이 없어요.</p>
        ) : (
          <ul className="my-comments">
            {user.comments.map((c) => {
              const [title, currentId] = context.seriesInfo[c.series_id] ?? ["지난 프로그램", null];
              return (
                <li key={c.id}>
                  <div className="my-comment-head">
                    {currentId ? <Link href={`/programs/${currentId}`}>{title}</Link> : <span>{title}</span>}
                    <div className="admin-actions">
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => run("admin_moderate_comment", { target: c.id, act: c.hidden ? "show" : "hide" }, c.hidden ? "다시 보이게 했어요." : "숨겼어요.")}
                      >
                        {c.hidden ? "보이기" : "숨기기"}
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => window.confirm("댓글을 지울까요?") && run("admin_moderate_comment", { target: c.id, act: "delete" }, "지웠어요.")}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                  <p>
                    {c.hidden && <span className="admin-tag">숨김</span>}
                    {c.hidden && " "}
                    {c.body}
                  </p>
                  <time>{formatDateTime(c.created_at)}</time>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {user.feedback.length > 0 && (
        <section className="card my-card">
          <h2 className="card-title">보낸 의견 {user.feedback.length}개</h2>
          <ul className="my-comments">
            {user.feedback.map((f) => (
              <li key={f.id}>
                <div className="my-comment-head">
                  <span>
                    {f.category} · {FEEDBACK_STATUS[f.status]}
                  </span>
                </div>
                <p>{f.body}</p>
                <time>{formatDateTime(f.created_at)}</time>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card my-card">
        <h2 className="card-title">관심 공고 {user.favorites.length}개</h2>
        {user.favorites.length === 0 ? (
          <p className="card-sub">관심 표시한 공고가 없어요.</p>
        ) : (
          <ul className="admin-list">
            {user.favorites.slice(0, 30).map((programId) => {
              const found = titleOf(programId);
              return (
                <li key={programId}>
                  {found ? <Link href={`/programs/${found[1]}`}>{found[0]}</Link> : <span className="admin-meta">지난 공고 ({programId})</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button className="text-button admin-back" onClick={onBack}>
      <ChevronIcon size={16} dir="left" /> 회원 목록
    </button>
  );
}
