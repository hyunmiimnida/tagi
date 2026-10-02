"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminRpc, formatDateTime, PAGE_SIZE } from "../../lib/admin.ts";
import type { AdminComment, Page } from "../../lib/admin.ts";
import type { AdminContext } from "./AdminApp.tsx";
import { Pager } from "./AdminUsers.tsx";

const VIEWS = [
  { id: "reported", label: "확인할 신고" },
  { id: "hidden", label: "숨긴 댓글" },
  { id: "all", label: "전체" },
];

interface Props {
  context: AdminContext;
  onChange: () => void;
  openUser: (id: string) => void;
}

// 댓글 관리: 신고된 댓글을 먼저 보고 숨기기·다시 보이기·문제 없음·지우기
export function AdminComments({ context, onChange, openUser }: Props) {
  const [view, setView] = useState("reported");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<AdminComment> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    const result = await adminRpc<Page<AdminComment>>("admin_comments", { mode: view, q: submitted, lim: PAGE_SIZE, off: page * PAGE_SIZE });
    setData(result.data);
    setError(result.error);
  }, [view, submitted, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: number, action: "hide" | "show" | "keep" | "delete") {
    if (action === "delete" && !window.confirm("댓글을 지울까요? 되돌릴 수 없어요.")) return;
    setBusy(id);
    const result = await adminRpc("admin_moderate_comment", { target: id, act: action });
    setBusy(null);
    setError(result.error);
    onChange();
    void load();
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
          <input value={query} placeholder="내용·닉네임으로 찾기" aria-label="댓글 찾기" onChange={(e) => setQuery(e.target.value)} />
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
        <p className="card-sub">신고가 3건 쌓이면 자동으로 숨겨져요. &ldquo;문제 없음&rdquo;을 누르면 다시 보이고, 그 뒤에 새로 3건이 쌓여야 다시 숨겨져요.</p>
      </section>

      {error && <p className="admin-error">{error}</p>}
      {data && data.rows.length === 0 && (
        <p className="section-empty card my-card">{view === "reported" ? "확인할 신고가 없어요." : "해당하는 댓글이 없어요."}</p>
      )}
      {data?.rows.map((c) => {
        const [title, currentId] = context.seriesInfo[c.series_id] ?? ["지난 프로그램", null];
        return (
          <section key={c.id} className="card my-card admin-feedback">
            <div className="row-meta">
              {c.hidden && <span className="admin-tag">숨김</span>}
              {c.open_reports > 0 && <span className="admin-tag warn">신고 {c.open_reports}</span>}
              {c.reports > c.open_reports && <span>확인한 신고 {c.reports - c.open_reports}</span>}
              <span>{formatDateTime(c.created_at)}</span>
            </div>
            <div className="admin-meta">
              {currentId ? <Link href={`/programs/${currentId}`}>{title}</Link> : title}
            </div>
            <p className="admin-body">{c.body}</p>
            {c.reasons && c.reasons.length > 0 && <p className="admin-meta">신고 이유: {c.reasons.join(", ")}</p>}
            <div className="admin-meta">
              <button className="link-button" onClick={() => openUser(c.user_id)}>
                {c.author}
              </button>
              {c.author_suspended && <span className="warn"> · 정지 중</span>}
            </div>
            <div className="report-info-actions">
              <button className="text-button" disabled={busy === c.id} onClick={() => act(c.id, "delete")}>
                지우기
              </button>
              {c.hidden ? (
                <button className="button small" disabled={busy === c.id} onClick={() => act(c.id, "show")}>
                  다시 보이기
                </button>
              ) : (
                <button className="button small" disabled={busy === c.id} onClick={() => act(c.id, "hide")}>
                  숨기기
                </button>
              )}
              {c.open_reports > 0 && (
                <button className="button primary small" disabled={busy === c.id} onClick={() => act(c.id, "keep")}>
                  문제 없음
                </button>
              )}
            </div>
          </section>
        );
      })}
      {data && (
        <div className="card">
          <Pager page={page} total={data.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
