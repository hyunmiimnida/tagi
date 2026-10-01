"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { COMMENT_RULES, REPORT_REASONS } from "../lib/policy.ts";
import { supabase, useUser } from "../lib/user.tsx";

// 반복 프로그램 후기·정보 나눔. 같은 묶음(seriesId)의 모든 회차가 댓글을 함께 본다.
// 누구나 읽을 수 있고, 이용 규칙에 동의한 로그인 사용자만 쓴다.
// 다른 사람 글은 신고하거나 숨길 수 있다 (supabase/moderation.sql)

const MAX_LENGTH = 500;
const SPAM_NOTICES: Record<string, string> = {
  too_fast: "조금 전에 댓글을 썼어요. 20초 뒤에 다시 써 주세요.",
  daily: "오늘은 댓글을 더 쓸 수 없어요. 하루에 20개까지 쓸 수 있어요.",
  duplicate: "같은 내용의 댓글을 이미 썼어요.",
  links: "링크는 댓글 하나에 1개까지 넣을 수 있어요.",
};

interface Comment {
  id: number;
  body: string;
  created_at: string;
  mine: boolean;
  author?: string; // 닉네임 (없으면 "익명")
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
  const [agreed, setAgreed] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { userId } = user;

  // 로그인이 바뀌면 "내 글"과 숨긴 글이 달라지므로 다시 불러온다
  const load = useCallback(async () => {
    if (!supabase) return;
    const query = (columns: string) =>
      supabase!.from("comment_feed").select(columns).eq("series_id", seriesId).order("created_at", { ascending: false }).limit(100);
    // 닉네임 칸(supabase/profile.sql)이 아직 없으면 닉네임 없이 불러온다
    let { data, error } = await query("id, body, created_at, mine, author");
    if (error?.code === "42703") ({ data, error } = await query("id, body, created_at, mine"));
    // 댓글 표를 아직 만들지 않았으면(supabase/*.sql 미실행) 준비 중으로 보여 준다
    if (error) (error.code === "PGRST205" || error.code === "42P01" ? setMissingTable : setFailed)(true);
    else setComments(data as unknown as Comment[]);
  }, [seriesId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 이용 규칙에 동의했는지 (계정에 저장)
  useEffect(() => {
    if (!supabase || !userId) return;
    void supabase
      .from("profiles")
      .select("rules_agreed_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setAgreed(Boolean(data?.rules_agreed_at)));
  }, [userId]);

  async function agree() {
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: userId, school_id: user.schoolId, rules_agreed_at: new Date().toISOString() });
    if (error) setFailed(true);
    else setAgreed(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!supabase || !userId || !body || sending) return;
    setSending(true);
    const { error } = await supabase.from("comments").insert({ series_id: seriesId, user_id: userId, body });
    setSending(false);
    if (error) {
      // 도배 막기 규칙(supabase/spam.sql)에 걸리면 이유를 알려 주고, 쓴 글은 그대로 둔다
      const spam = error.message.match(/spam:(\w+)/)?.[1];
      if (spam) setNotice(SPAM_NOTICES[spam] ?? SPAM_NOTICES.too_fast);
      else setFailed(true);
      return;
    }
    setDraft("");
    void load();
  }

  async function remove(id: number) {
    if (!supabase || !window.confirm("댓글을 지울까요?")) return;
    await supabase.rpc("delete_my_comment", { target: id });
    void load();
  }

  async function block(id: number, ask = true) {
    if (!supabase) return;
    if (ask && !window.confirm("이 사람의 글을 앞으로 보지 않을까요? 프로필에서 다시 볼 수 있어요.")) return;
    const { error } = await supabase.rpc("block_comment_author", { target: id });
    setNotice(error ? "숨기지 못했어요. 잠시 후 다시 시도해 주세요." : "이 사람의 글을 숨겼어요.");
    void load();
  }

  async function report(id: number, reason: string) {
    if (!supabase) return;
    setReporting(null);
    const { error } = await supabase.rpc("report_comment", { target: id, why: reason });
    if (error) {
      setNotice("신고하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (window.confirm("신고했어요. 이 사람의 글을 앞으로 보지 않을까요?")) await block(id, false);
    else setNotice("신고했어요. 확인 후 조치할게요.");
  }

  // 신고·숨기기는 로그인해야 할 수 있다
  const needLogin = (action: () => void) => () => (user.signedIn ? action() : user.setLoginOpen(true));

  return (
    <section className="card comments">
      <h2 className="card-title">후기·정보 나눔</h2>
      <p className="card-sub">지난 회차에 참여했다면 준비 팁이나 후기를 남겨 주세요. 다음 회차를 준비하는 학생에게 도움이 돼요.</p>

      {!user.loginEnabled || missingTable ? (
        <p className="comment-empty">댓글 기능을 준비하고 있어요. 곧 후기를 남길 수 있어요.</p>
      ) : (
        <>
          {!user.signedIn ? (
            <button className="button wide" onClick={() => user.setLoginOpen(true)}>
              로그인하고 후기 남기기
            </button>
          ) : agreed === false ? (
            <div className="comment-rules">
              <strong>댓글 이용 규칙</strong>
              <ul>
                {COMMENT_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <p>
                규칙을 어긴 글은 신고가 쌓이면 숨겨지고 지워질 수 있어요. 자세한 내용은 <Link href="/terms">이용약관</Link>에
                있어요.
              </p>
              <button className="button primary small" onClick={agree}>
                동의하고 후기 쓰기
              </button>
            </div>
          ) : agreed ? (
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
                  {draft.length}/{MAX_LENGTH} · {user.profile.nickname ? `"${user.profile.nickname}"(으)로` : "익명으로"} 올라가요
                </span>
                <button className="button primary small" disabled={!draft.trim() || sending}>
                  {sending ? "올리는 중" : "올리기"}
                </button>
              </div>
            </form>
          ) : null}

          {notice && (
            <p className="comment-empty" role="status">
              {notice}
            </p>
          )}
          {failed && <p className="comment-empty">댓글을 불러오거나 올리지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
          {comments && comments.length === 0 && !failed && <p className="comment-empty">아직 댓글이 없어요. 첫 후기를 남겨 주세요.</p>}
          {comments && comments.length > 0 && (
            <ul className="comment-list">
              {comments.map((comment) => (
                <li key={comment.id}>
                  <div className="comment-meta">
                    <strong>{comment.mine ? "나" : (comment.author ?? "익명")}</strong>
                    <span>{timeAgo(comment.created_at)}</span>
                    <span className="comment-tools">
                      {comment.mine ? (
                        <button className="text-button" onClick={() => remove(comment.id)}>
                          삭제
                        </button>
                      ) : (
                        <>
                          <button
                            className="text-button"
                            aria-expanded={reporting === comment.id}
                            onClick={needLogin(() => setReporting(reporting === comment.id ? null : comment.id))}
                          >
                            신고
                          </button>
                          <button className="text-button" onClick={needLogin(() => void block(comment.id))}>
                            숨기기
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  {reporting === comment.id && (
                    <div className="report-reasons" role="group" aria-label="신고 이유">
                      {REPORT_REASONS.map((reason) => (
                        <button key={reason} className="report-reason" onClick={() => void report(comment.id, reason)}>
                          {reason}
                        </button>
                      ))}
                    </div>
                  )}
                  <p>{comment.body}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
