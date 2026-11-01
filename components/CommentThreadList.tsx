import type { ReactNode } from "react";
import { groupCommentThreads } from "../lib/comment-threads.ts";
import type { Comment } from "../lib/comment-threads.ts";
import { REPORT_REASONS } from "../lib/policy.ts";
import { palRows } from "../lib/pixel-pals.ts";
import type { Avatar } from "../lib/pixel-pals.ts";
import { PixelSprite } from "./PixelPal.tsx";

interface Props {
  comments: Comment[];
  faces: Map<number, Avatar>;
  avatar: Avatar | null;
  hasReplies: boolean;
  reporting: number | null;
  onReporting: (id: number) => void;
  onRemove: (comment: Comment) => void;
  onBlock: (id: number) => void;
  onReport: (id: number, reason: string) => void;
  onReply: (id: number) => void;
  replying: number | null;
  replyForm: ReactNode;
}

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
  const date = new Date(iso);
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

export function CommentThreadList(props: Props) {
  const { comments, faces, avatar, hasReplies, reporting, onReporting, onRemove, onBlock, onReport, onReply, replying, replyForm } = props;
  function content(comment: Comment) {
    const face = comment.mine ? (avatar ?? faces.get(comment.id)) : faces.get(comment.id);
    return <>
      <div className="comment-meta">
        <span className="comment-face" aria-hidden="true">
          {face && <PixelSprite rows={palRows(face, "sit").slice(0, 12)} scale={2} />}
        </span>
        <strong>{comment.mine ? "나" : (comment.author ?? "익명")}</strong>
        <span>{timeAgo(comment.created_at)}</span>
        <span className="comment-tools">
          {comment.mine ? <button className="text-button" onClick={() => onRemove(comment)}>삭제</button> : <>
            <button className="text-button" aria-expanded={reporting === comment.id} onClick={() => onReporting(comment.id)}>신고</button>
            <button className="text-button" onClick={() => onBlock(comment.id)}>숨기기</button>
          </>}
        </span>
      </div>
      {reporting === comment.id && <div className="report-reasons" role="group" aria-label="신고 이유">
        {REPORT_REASONS.map((reason) => <button key={reason} className="report-reason" onClick={() => onReport(comment.id, reason)}>{reason}</button>)}
      </div>}
      <p>{comment.body}</p>
    </>;
  }
  return <ul className="comment-list">
    {groupCommentThreads(comments).map(({ id, root, replies }) => <li key={id}>
      {!root || root.deleted ? <p className="comment-unavailable">{root?.deleted ? "삭제된 글이에요" : "볼 수 없는 글이에요"}</p> : <>
        {content(root)}
        {hasReplies && <button className="text-button" aria-expanded={replying === id} onClick={() => onReply(id)}>답글</button>}
        {replying === id && replyForm}
      </>}
      {replies.length > 0 && <ul className="comment-replies" aria-label="답글">
        {replies.map((reply) => <li key={reply.id}>{content(reply)}</li>)}
      </ul>}
    </li>)}
  </ul>;
}
