// 뷰의 새 칸이 없는 운영 DB도 읽을 수 있게, 답글·종류·닉네임 지원을 따로 확인한다.
export type CommentKind = "review" | "talk";

export interface Comment {
  id: number;
  body: string;
  created_at: string;
  mine: boolean;
  author?: string | null;
  kind?: CommentKind;
  parent_id?: number | null;
  deleted?: boolean;
}

interface FeedError { code: string; message: string }
type FetchPage = (columns: string, after: number | null) => PromiseLike<{ data: unknown; error: FeedError | null }>;
export const COMMENT_PAGE_SIZE = 100;

export async function loadCommentFeed(fetchPage: FetchPage) {
  const variants = [
    { replies: true, kinds: true, author: true },
    { replies: true, kinds: true, author: false },
    { replies: false, kinds: true, author: true },
    { replies: false, kinds: true, author: false },
    { replies: false, kinds: false, author: true },
    { replies: false, kinds: false, author: false },
  ];
  for (const flags of variants) {
    const columns = ["id", "body", "created_at", "mine", ...(flags.author ? ["author"] : []),
      ...(flags.kinds ? ["kind"] : []), ...(flags.replies ? ["parent_id", "deleted"] : [])].join(", ");
    let page = await fetchPage(columns, null);
    if (page.error?.code === "42703") continue;
    const comments: Comment[] = [];
    // id를 기준으로 100개씩 나누어 읽어 원글과 답글을 끝까지 모은다.
    while (!page.error) {
      const rows = page.data as Comment[];
      comments.push(...rows);
      if (rows.length < COMMENT_PAGE_SIZE) break;
      page = await fetchPage(columns, rows[rows.length - 1].id);
    }
    return { comments, hasKinds: flags.kinds, hasReplies: flags.replies, error: page.error };
  }
  return { comments: [], hasKinds: false, hasReplies: false, error: { code: "42703", message: "댓글 칸을 찾지 못했어요." } };
}

export interface CommentThread {
  id: number;
  root?: Comment; // 숨김·차단으로 뷰에서 빠진 원글은 없음
  replies: Comment[];
}

const oldest = (a: Comment, b: Comment) => a.created_at.localeCompare(b.created_at) || a.id - b.id;

export function groupCommentThreads(comments: Comment[]): CommentThread[] {
  const threads = new Map<number, CommentThread>();
  for (const comment of comments) {
    const id = comment.parent_id ?? comment.id;
    const thread = threads.get(id) ?? { id, replies: [] };
    if (comment.parent_id != null) thread.replies.push(comment);
    else thread.root = comment;
    threads.set(id, thread);
  }
  for (const thread of threads.values()) thread.replies.sort(oldest);
  return [...threads.values()].sort((a, b) => oldest(b.root ?? b.replies[0], a.root ?? a.replies[0]));
}

export function countOriginals(comments: Comment[], kind: CommentKind) {
  return comments.filter((c) => c.parent_id == null && !c.deleted && (c.kind ?? "review") === kind).length;
}
