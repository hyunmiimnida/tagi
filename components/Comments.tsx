"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, useUser } from "../lib/user.tsx";

// 반복 프로그램 후기·정보 나눔. 같은 묶음(seriesId)의 모든 회차가 댓글을 함께 본다.
// 누구나 읽을 수 있고, 로그인한 사람만 쓰고 자기 글을 지울 수 있다 (supabase/schema.sql의 comments 표)

const MAX_LENGTH = 500;

interface Comment {
  id: number;
  user_id: string;
  body: string;
  created_at: string;
}

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
  const date = new Date(iso);
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

export function Comments({ seriesId }: { seriesId: string }) {
  const user = useUser();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [missingTable, setMissingTable] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("comments")
      .select("id, user_id, body, created_at")
      .eq("series_id", seriesId)
      .order("created_at", { ascending: false })
      .limit(100);
    // 댓글 표를 아직 만들지 않았으면(supabase/schema.sql 미실행) 준비 중으로 보여 준다
    if (error) (error.code === "PGRST205" || error.code === "42P01" ? setMissingTable : setFailed)(true);
    else setComments(data as Comment[]);
  }, [seriesId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!supabase || !user.userId || !body || sending) return;
    setSending(true);
    const { error } = await supabase.from("comments").insert({ series_id: seriesId, user_id: user.userId, body });
    setSending(false);
    if (error) {
      setFailed(true);
      return;
    }
    setDraft("");
    void load();
  }

  async function remove(id: number) {
    if (!supabase || !window.confirm("댓글을 지울까요?")) return;
    await supabase.from("comments").delete().eq("id", id);
    void load();
  }

  return (
    <section className="card comments">
      <h2 className="card-title">후기·정보 나눔</h2>
      <p className="card-sub">지난 회차에 참여했다면 준비 팁이나 후기를 남겨 주세요. 다음 회차를 준비하는 학생에게 도움이 돼요.</p>

      {!user.loginEnabled || missingTable ? (
        <p className="comment-empty">댓글 기능을 준비하고 있어요. 곧 후기를 남길 수 있어요.</p>
      ) : (
        <>
          {user.signedIn ? (
            <form className="comment-form" onSubmit={submit}>
              <textarea
                value={draft}
                maxLength={MAX_LENGTH}
                rows={3}
                placeholder="예: 서류는 2주 전부터 준비했어요. 면접에서는 지원 동기를 물어봤어요."
                aria-label="댓글 내용"
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="comment-form-foot">
                <span>
                  {draft.length}/{MAX_LENGTH} · 익명으로 올라가요
                </span>
                <button className="button primary small" disabled={!draft.trim() || sending}>
                  {sending ? "올리는 중" : "올리기"}
                </button>
              </div>
            </form>
          ) : (
            <button className="button wide" onClick={() => user.setLoginOpen(true)}>
              로그인하고 후기 남기기
            </button>
          )}

          {failed && <p className="comment-empty">댓글을 불러오거나 올리지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
          {comments && comments.length === 0 && !failed && <p className="comment-empty">아직 댓글이 없어요. 첫 후기를 남겨 주세요.</p>}
          {comments && comments.length > 0 && (
            <ul className="comment-list">
              {comments.map((comment) => {
                const mine = comment.user_id === user.userId;
                return (
                  <li key={comment.id}>
                    <div className="comment-meta">
                      <strong>{mine ? "나" : "익명"}</strong>
                      <span>{timeAgo(comment.created_at)}</span>
                      {mine && (
                        <button className="text-button" onClick={() => remove(comment.id)}>
                          삭제
                        </button>
                      )}
                    </div>
                    <p>{comment.body}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
