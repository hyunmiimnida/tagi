"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "../lib/analytics.ts";
import { reviewRewardNote } from "../lib/gacha.ts";
import { COMMENT_RULES, REVIEW_USE_NOTICE } from "../lib/policy.ts";
import { toValidAvatar } from "../lib/pixel-pals.ts";
import type { Avatar } from "../lib/pixel-pals.ts";
import { supabase, useToday, useUser } from "../lib/user.tsx";
import { CommentForm } from "./CommentForm.tsx";
import { CommentThreadList } from "./CommentThreadList.tsx";
import { COMMENT_PAGE_SIZE, countOriginals, loadCommentFeed } from "../lib/comment-threads.ts";
import type { Comment, CommentKind } from "../lib/comment-threads.ts";
import { emptyReview, loadAdminReviewRounds, loadReviewSummary, REVIEW_SUMMARY_COLUMNS, REVIEW_SUMMARY_PAGE_SIZE, reviewErrorNotice, reviewPayload, reviewRoundsForToday, validateReview, writableReviewRounds } from "../lib/program-reviews.ts";
import type { ReviewRound, ReviewSummary as Summary } from "../lib/program-reviews.ts";
import { ReviewFields } from "./ReviewFields.tsx";
import { ReviewSummary } from "./ReviewSummary.tsx";

// 반복 프로그램 후기·정보 나눔. 같은 묶음(seriesId)의 모든 회차가 댓글을 함께 본다.
// 누구나 읽을 수 있고, 이용 규칙에 동의한 로그인 사용자만 쓴다.
// 다른 사람 글은 신고하거나 숨길 수 있다 (supabase/moderation.sql)

const SPAM_NOTICES: Record<string, string> = {
  too_fast: "조금 전에 댓글을 썼어요. 20초 뒤에 다시 써 주세요.",
  daily: "오늘은 댓글을 더 쓸 수 없어요. 하루에 20개까지 쓸 수 있어요.",
  duplicate: "같은 내용의 댓글을 이미 썼어요.",
  links: "링크는 댓글 하나에 1개까지 넣을 수 있어요.",
  suspended: "이용 규칙 위반으로 댓글 쓰기가 정지된 계정이에요.",
};

const KIND_TEXT: Record<CommentKind, { label: string; placeholder: string; empty: string }> = {
  review: {
    label: "후기",
    placeholder: "예: 서류는 2주 전부터 준비했어요. 면접에서는 지원 동기를 물어봤어요.",
    empty: "아직 후기가 없어요. 첫 후기를 남겨 주세요.",
  },
  talk: {
    label: "대화",
    placeholder: "예: 이번 회차도 비슷한 때에 모집할까요?",
    empty: "아직 대화가 없어요. 먼저 말을 걸어 보세요.",
  },
};
const KINDS = Object.keys(KIND_TEXT) as CommentKind[];

export function Comments({ seriesId, rounds }: { seriesId: string; rounds: ReviewRound[] }) {
  const user = useUser();
  const { userId } = user;
  const today = useToday();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [missingTable, setMissingTable] = useState(false);
  const [agreed, setAgreed] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [faces, setFaces] = useState<Map<number, Avatar>>(new Map()); // 댓글 id → 글쓴이 캐릭터
  const [kind, setKind] = useState<CommentKind>("review"); // 보고 있는 탭이 곧 쓰는 글의 종류
  const [hasKinds, setHasKinds] = useState(false); // comment-threads.sql을 실행했는지
  const [hasReplies, setHasReplies] = useState(false);
  const [replying, setReplying] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [rewardNote, setRewardNote] = useState<string | null>(null);
  const [reviews, setReviews] = useState<{ available: boolean; rows: Summary[] } | null>(null);
  const [adminReviews, setAdminReviews] = useState<{ userId: string; seriesId: string; rows: Summary[] } | null>(null);
  const isAdmin = Boolean(userId && adminReviews?.userId === userId && adminReviews.seriesId === seriesId);
  const currentRounds = reviewRoundsForToday(rounds, today);
  const writableRounds = writableReviewRounds(currentRounds);
  const [review, setReview] = useState(() => emptyReview(writableRounds[0]?.id ?? ""));
  const selectedReview = writableRounds.some((round) => round.id === review.program_id)
    ? review : { ...review, program_id: writableRounds[0]?.id ?? "" };
  const hasRatings = Boolean(reviews?.available && hasKinds);
  const writingReview = !hasKinds || kind === "review";
  // 후기를 처음 쓰기 시작한 순간 한 번 기록한다 (이용 기록, lib/analytics.ts)
  const reviewStarted = useRef(false);
  useEffect(() => {
    if (!writingReview || !draft || reviewStarted.current) return;
    reviewStarted.current = true;
    track("review_start");
  }, [writingReview, draft]);
  const waitingForRound = hasRatings && writingReview && writableRounds.length === 0;
  const loadVersion = useRef(0);
  const text = KIND_TEXT[hasKinds ? kind : "review"];
  const visible = hasKinds ? comments?.filter((c) => (c.kind ?? "review") === kind) : comments;

  // 로그인이 바뀌면 "내 글"과 숨긴 글이 달라지므로 다시 불러온다
  const load = useCallback(async () => {
    if (!supabase) return;
    const version = ++loadVersion.current;
    setFailed(false);
    setMissingTable(false);
    const [result, reviewResult, adminResult] = await Promise.all([loadCommentFeed((columns, after) => {
      let query = supabase!.from("comment_feed").select(columns).eq("series_id", seriesId)
        .order("id", { ascending: true }).limit(COMMENT_PAGE_SIZE);
      if (after !== null) query = query.gt("id", after);
      return query;
    }), loadReviewSummary((offset) => supabase!.from("review_summary").select(REVIEW_SUMMARY_COLUMNS)
      .eq("series_id", seriesId).order("program_id", { ascending: true, nullsFirst: true })
      .range(offset, offset + REVIEW_SUMMARY_PAGE_SIZE - 1)), (async () => {
        if (!userId) return null;
        const rows = await loadAdminReviewRounds(() => supabase!.rpc("is_admin"),
          (offset) => supabase!.rpc("admin_review_rounds", { target_series: seriesId })
          .order("program_id").range(offset, offset + REVIEW_SUMMARY_PAGE_SIZE - 1));
        return rows === null ? null : { userId, seriesId, rows };
      })()]);
    const { error } = result;
    if (version !== loadVersion.current) return;
    setReviews(reviewResult);
    setAdminReviews(adminResult);
    setHasKinds(result.hasKinds);
    setHasReplies(result.hasReplies);
    // 댓글 표를 아직 만들지 않았으면(supabase/*.sql 미실행) 준비 중으로 보여 준다
    if (error) (error.code === "PGRST205" || error.code === "42P01" ? setMissingTable : setFailed)(true);
    else {
      const list = result.comments;
      setComments(list);
      // 글쓴이 캐릭터 얼굴 (supabase/avatar.sql의 comment_avatars. 아직 없으면 얼굴 없이 보여 준다)
      const ids = list.filter((c) => !c.deleted).map((c) => c.id);
      const next = new Map<number, Avatar>();
      for (let start = 0; start < ids.length; start += COMMENT_PAGE_SIZE) {
        const faceRows = await supabase.from("comment_avatars").select("comment_id, avatar").in("comment_id", ids.slice(start, start + COMMENT_PAGE_SIZE));
        if (!faceRows.error) {
          for (const row of faceRows.data as { comment_id: number; avatar: unknown }[]) {
            const face = toValidAvatar(row.avatar);
            if (face) next.set(row.comment_id, face);
          }
        }
      }
      if (version === loadVersion.current) setFaces(next);
    }
  }, [seriesId, userId]);

  useEffect(() => {
    setComments(null);
    setAdminReviews(null);
    setReplying(null);
    setReplyDraft("");
    void load();
    return () => { loadVersion.current++; };
  }, [load]);

  // 오늘 남은 후기 보상 (내 기록만 읽을 수 있다, supabase/gacha.sql. 못 읽으면 안내 없이 둔다)
  const loadReward = useCallback(async () => {
    setRewardNote(null);
    if (!supabase || !userId) return;
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const [ledger, wallet] = await Promise.all([
      supabase.from("key_ledger").select("created_at, series_id").eq("user_id", userId).eq("reason", "review"),
      supabase.from("key_wallets").select("key_debt").eq("user_id", userId).maybeSingle(),
    ]);
    if (ledger.error || wallet.error) return;
    const rows = ledger.data as { created_at: string; series_id: string | null }[];
    const usedToday = rows.filter((r) => Date.parse(r.created_at) >= Date.parse(`${today}T00:00:00+09:00`)).length;
    setRewardNote(reviewRewardNote(usedToday, wallet.data?.key_debt ?? 0, rows.some((r) => r.series_id === seriesId)));
  }, [seriesId, userId]);

  useEffect(() => {
    void loadReward();
  }, [loadReward]);

  // 이용 규칙에 동의했는지 (계정에 저장)
  useEffect(() => {
    setAgreed(null);
    if (!supabase || !userId) return;
    let active = true;
    void supabase
      .from("profiles")
      .select("rules_agreed_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => { if (active) setAgreed(Boolean(data?.rules_agreed_at)); });
    return () => { active = false; };
  }, [userId]);

  async function agree() {
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: userId, school_id: user.schoolId, rules_agreed_at: new Date().toISOString() });
    if (error) setFailed(true);
    else setAgreed(true);
  }

  async function submit(event: React.FormEvent, parentId: number | null = null) {
    event.preventDefault();
    const body = (parentId === null ? draft : replyDraft).trim();
    if (!supabase || !userId || !agreed || !body || sending || reviews === null) return;
    if (hasRatings && writingReview && parentId === null) {
      const invalid = validateReview(selectedReview, currentRounds);
      if (invalid) { setNotice(invalid); return; }
    }
    setSending(true);
    const { error } = await supabase.from("comments").insert({ series_id: seriesId, user_id: userId, body,
      ...(hasKinds ? { kind } : {}), ...(parentId !== null ? { parent_id: parentId } : {}),
      ...reviewPayload(selectedReview, hasRatings, hasKinds ? kind : "review", parentId) });
    setSending(false);
    if (error) {
      const ratingNotice = reviewErrorNotice(error);
      if (ratingNotice) { setNotice(ratingNotice); return; }
      const reply = error.message.match(/reply:(\w+)/)?.[1];
      if (reply) {
        const notices: Record<string, string> = {
          missing: "원글을 찾을 수 없어요. 목록을 다시 확인해 주세요.",
          nested: "답글에는 답글을 달 수 없어요. 원글 아래에 써 주세요.",
          series: "다른 프로그램의 글에는 답글을 달 수 없어요.",
          deleted: "삭제된 글에는 답글을 달 수 없어요.",
          unavailable: "지금 볼 수 없는 글에는 답글을 달 수 없어요.",
        };
        setNotice(notices[reply] ?? "이 글에는 답글을 달 수 없어요.");
        void load();
        return;
      }
      // 도배 막기 규칙(supabase/spam.sql)에 걸리면 이유를 알려 주고, 쓴 글은 그대로 둔다
      const spam = error.message.match(/spam:(\w+)/)?.[1];
      if (spam === "suspended") {
        // 관리자가 정지한 계정 (supabase/admin.sql): 언제까지인지 함께 알린다
        const { data } = await supabase.rpc("my_suspension");
        const until = (data as { until: string | null } | null)?.until;
        setNotice(`${SPAM_NOTICES.suspended} ${until ? `${new Date(until).toLocaleDateString("ko-KR")}까지 쓸 수 없어요.` : ""}`.trim());
      } else if (spam) setNotice(SPAM_NOTICES[spam] ?? SPAM_NOTICES.too_fast);
      else setFailed(true);
      return;
    }
    setNotice(null);
    if (parentId === null) { setDraft(""); setReview(emptyReview(selectedReview.program_id)); }
    else { setReplyDraft(""); setReplying(null); }
    if (parentId === null) {
      if (writingReview) track("review_submit");
      user.refreshKeys(); // 답글에는 후기 선물이 없다
      void loadReward();
    }
    void load();
  }

  async function remove(comment: Comment) {
    const id = comment.id;
    const question = comment.parent_id != null ? "답글을 지울까요?"
      : comment.kind === "talk" ? "글을 지울까요?"
      : "후기를 지울까요? 받은 열쇠조각은 회수돼요.";
    const replyNote = comments?.some((reply) => reply.parent_id === id)
      ? " 답글은 남고 내용만 지워져요." : "";
    if (!supabase || !window.confirm(question + replyNote)) return;
    const { error } = await supabase.rpc("delete_my_comment", { target: id });
    if (error) { setNotice("지우지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
    user.refreshKeys();
    void loadReward();
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
      <h2 className="card-title">{hasKinds ? "후기·대화" : "후기·정보 나눔"}</h2>
      {hasKinds && (
        <div className="segmented comment-kinds" role="group" aria-label="글 종류">
          {KINDS.map((k) => (
            <button key={k} type="button" className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => { setKind(k); setReplying(null); setReplyDraft(""); }}>
              {KIND_TEXT[k].label} {countOriginals(comments ?? [], k)}
            </button>
          ))}
        </div>
      )}
      {hasRatings && writingReview && <ReviewSummary key={`${seriesId}:${userId ?? ""}`} rows={reviews!.rows.filter((row) => row.series_id === seriesId && row.program_id === null)}
        roundRows={isAdmin ? adminReviews!.rows : []} rounds={currentRounds} isAdmin={isAdmin} />}
      {rewardNote && text === KIND_TEXT.review && user.signedIn && <p className="card-sub">{rewardNote}</p>}

      {!user.loginEnabled || missingTable ? (
        <p className="comment-empty">댓글 기능을 준비하고 있어요. 곧 후기를 남길 수 있어요.</p>
      ) : (
        <>
          {reviews === null ? (
            <p className="comment-empty">댓글을 불러오는 중이에요.</p>
          ) : waitingForRound ? (
            <p className="comment-empty">모집이 끝나면 후기를 쓸 수 있어요</p>
          ) : !user.signedIn ? (
            <button className="button wide" onClick={() => user.setLoginOpen(true)}>
              로그인하고 {text.label === "후기" ? "후기" : "글"} 남기기
            </button>
          ) : agreed === false ? (
            <div className="comment-rules">
              <strong>댓글 이용 규칙</strong>
              <ul>
                {COMMENT_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <p>{REVIEW_USE_NOTICE}</p>
              <p>
                규칙을 어긴 글은 신고가 쌓이면 숨겨지고 지워질 수 있어요. 자세한 내용은 <Link href="/terms">이용약관</Link>에
                있어요.
              </p>
              <button className="button primary small" onClick={agree}>
                동의하고 글 쓰기
              </button>
            </div>
          ) : agreed ? (
            <CommentForm draft={draft} onDraft={setDraft} onSubmit={submit} sending={sending}
              label={hasKinds ? text.label : "글"} placeholder={text.placeholder} nickname={user.profile.nickname}>
              {hasRatings && writingReview &&
                <ReviewFields draft={selectedReview} rounds={writableRounds} onChange={setReview} disabled={sending} />
              }
            </CommentForm>
          ) : null}

          {notice && (
            <p className="comment-empty" role="status">
              {notice}
            </p>
          )}
          {failed && <p className="comment-empty">댓글을 불러오거나 올리지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
          {visible && visible.length === 0 && !failed && <p className="comment-empty">{text.empty}</p>}
          {visible && visible.length > 0 && (
            <CommentThreadList comments={visible} faces={faces} avatar={user.avatar ?? null}
              hasReplies={hasReplies} reporting={reporting}
              onReporting={(id) => needLogin(() => setReporting(reporting === id ? null : id))()}
              onRemove={(comment) => void remove(comment)} onBlock={(id) => needLogin(() => void block(id))()}
              onReport={(id, reason) => void report(id, reason)}
              onReply={(id) => needLogin(() => {
                if (!agreed) { setNotice("위의 댓글 이용 규칙에 동의한 뒤 답글을 써 주세요."); return; }
                if (sending) return;
                setReplying(replying === id ? null : id);
                setReplyDraft("");
              })()}
              replying={replying}
              replyForm={agreed && <CommentForm draft={replyDraft} onDraft={setReplyDraft}
                onSubmit={(event) => void submit(event, replying)} sending={sending} label="답글"
                placeholder="이 글에 답글을 남겨 주세요." nickname={user.profile.nickname}
                onCancel={() => { setReplying(null); setReplyDraft(""); }} />} />
          )}
        </>
      )}
    </section>
  );
}
