"use client";

import { useCallback, useEffect, useState } from "react";
import { describeError, FEEDBACK_STATUS, formatDateTime, PAGE_SIZE } from "../../lib/admin.ts";
import type { Feedback, FeedbackStatus } from "../../lib/admin.ts";
import { supabase } from "../../lib/user.tsx";
import { Pager } from "./AdminUsers.tsx";

const VIEWS: { id: FeedbackStatus | "all"; label: string }[] = [
  { id: "new", label: "새 의견" },
  { id: "doing", label: "확인 중" },
  { id: "done", label: "완료" },
  { id: "all", label: "전체" },
];
const CATEGORIES = ["전체", "버그", "제안", "기타"];

interface Props {
  onChange: () => void;
  openUser: (id: string) => void;
}

// 의견함: 프로필 "의견 보내기"로 들어온 의견. 상태를 바꾸고, 메모를 남기고, 답장한다 (답장은 보낸 사람 프로필에 보인다)
export function AdminFeedback({ onChange, openUser }: Props) {
  const [view, setView] = useState<FeedbackStatus | "all">("new");
  const [category, setCategory] = useState("전체");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Feedback[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    let query = supabase.from("feedback").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (view !== "all") query = query.eq("status", view);
    if (category !== "전체") query = query.eq("category", category);
    const { data, error, count } = await query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    setRows(error ? null : (data as Feedback[]));
    setTotal(count ?? 0);
    setError(error ? describeError(error) : null);
  }, [view, category, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="my">
      <section className="card my-card">
        <div className="my-options">
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
        <div className="my-options spaced">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={`tag-option ${category === c ? "on" : ""}`}
              aria-pressed={category === c}
              onClick={() => {
                setPage(0);
                setCategory(c);
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="admin-error">{error}</p>}
      {rows && rows.length === 0 && <p className="section-empty card my-card">해당하는 의견이 없어요.</p>}
      {rows?.map((f) => (
        <FeedbackCard
          key={f.id}
          item={f}
          openUser={openUser}
          onSaved={() => {
            onChange();
            void load();
          }}
        />
      ))}
      {rows && (
        <div className="card">
          <Pager page={page} total={total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

function FeedbackCard({ item, openUser, onSaved }: { item: Feedback; openUser: (id: string) => void; onSaved: () => void }) {
  const [note, setNote] = useState(item.admin_note ?? "");
  const [reply, setReply] = useState(item.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(patch: Partial<Feedback>, done: string) {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from("feedback").update(patch).eq("id", item.id);
    setBusy(false);
    setMessage(error ? describeError(error) : done);
    if (!error) onSaved();
  }

  async function remove() {
    if (!supabase || !window.confirm("이 의견을 지울까요?")) return;
    const { error } = await supabase.from("feedback").delete().eq("id", item.id);
    if (error) setMessage(describeError(error));
    else onSaved();
  }

  const changed = note !== (item.admin_note ?? "") || reply !== (item.reply ?? "");

  return (
    <section className="card my-card admin-feedback">
      <div className="row-meta">
        <span className={`admin-tag ${item.category === "버그" ? "warn" : ""}`}>{item.category}</span>
        <span>{FEEDBACK_STATUS[item.status]}</span>
        <span>· {formatDateTime(item.created_at)}</span>
        {item.page && <span>· {item.page}</span>}
      </div>
      <p className="admin-body">{item.body}</p>
      <div className="admin-meta">
        {item.user_id ? (
          <button className="link-button" onClick={() => openUser(item.user_id!)}>
            보낸 회원 보기
          </button>
        ) : (
          "로그인하지 않은 사람 (답장을 볼 수 없어요)"
        )}
      </div>

      <div className="my-options spaced">
        {(Object.keys(FEEDBACK_STATUS) as FeedbackStatus[]).map((s) => (
          <button
            key={s}
            className={`tag-option ${item.status === s ? "on" : ""}`}
            aria-pressed={item.status === s}
            disabled={busy || item.status === s}
            onClick={() => save({ status: s }, `"${FEEDBACK_STATUS[s]}"으로 바꿨어요.`)}
          >
            {FEEDBACK_STATUS[s]}
          </button>
        ))}
      </div>

      {item.user_id && (
        <label className="admin-field">
          <span>답장 (보낸 사람 프로필에 보여요){item.replied_at && ` · ${formatDateTime(item.replied_at)}에 보냄`}</span>
          <textarea value={reply} maxLength={1000} rows={3} placeholder="예: 알려 주셔서 고마워요. 고쳤어요!" onChange={(e) => setReply(e.target.value)} />
        </label>
      )}
      <label className="admin-field">
        <span>관리자 메모 (나만 보여요)</span>
        <textarea value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} />
      </label>
      {message && (
        <p className="nickname-note" role="status">
          {message}
        </p>
      )}
      <div className="report-info-actions">
        <button className="text-button" onClick={remove}>
          지우기
        </button>
        <button
          className="button primary small"
          disabled={busy || !changed}
          onClick={() =>
            save(
              {
                admin_note: note.trim() || null,
                reply: reply.trim() || null,
                // 답장을 처음 쓰면 "완료"로 바꾼다
                ...(reply.trim() && !item.reply && item.status !== "done" ? { status: "done" as const } : {}),
              },
              reply.trim() && reply !== (item.reply ?? "") ? "답장을 저장했어요." : "저장했어요.",
            )
          }
        >
          저장
        </button>
      </div>
    </section>
  );
}
