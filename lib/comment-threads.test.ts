import assert from "node:assert/strict";
import test from "node:test";
import { COMMENT_PAGE_SIZE, countOriginals, groupCommentThreads, loadCommentFeed } from "./comment-threads.ts";
import type { Comment } from "./comment-threads.ts";

function comment(id: number, parent_id: number | null = null, kind: "review" | "talk" = "review"): Comment {
  return { id, parent_id, kind, body: `글 ${id}`, created_at: new Date(id * 1000).toISOString(), mine: false };
}

test("답글 칸이 없는 42703 오류에서도 후기·대화 종류는 유지한다", async () => {
  for (const author of [true, false]) {
    const result = await loadCommentFeed(async (columns) => {
      if (columns.includes("parent_id") || (!author && columns.includes("author"))) {
        return { data: null, error: { code: "42703", message: "missing column" } };
      }
      assert.ok(columns.includes("kind"));
      return { data: [comment(1, null, "talk")], error: null };
    });
    assert.equal(result.hasKinds, true);
    assert.equal(result.hasReplies, false);
    assert.equal(result.comments[0].kind, "talk");
    assert.equal(result.error, null);
  }
});

test("종류·닉네임도 없는 예전 뷰는 기존 댓글 목록으로 읽는다", async () => {
  const result = await loadCommentFeed(async (columns) => {
    if (/kind|author|parent_id/.test(columns)) return { data: null, error: { code: "42703", message: "missing" } };
    return { data: [comment(1)], error: null };
  });
  assert.equal(result.hasKinds, false);
  assert.equal(result.hasReplies, false);
  assert.equal(result.comments.length, 1);
});

test("100개 넘는 답글을 나누어 모두 읽고 오래된 원글도 함께 묶는다", async () => {
  const rows = [comment(1), ...Array.from({ length: 250 }, (_, i) => comment(i + 2, 1))];
  const cursors: (number | null)[] = [];
  const result = await loadCommentFeed(async (_, after) => {
    cursors.push(after);
    return { data: rows.filter((r) => after === null || r.id > after).slice(0, COMMENT_PAGE_SIZE), error: null };
  });
  assert.deepEqual(cursors, [null, 100, 200]);
  assert.equal(result.hasReplies, true);
  const [thread] = groupCommentThreads(result.comments);
  assert.equal(thread.root?.id, 1);
  assert.equal(thread.replies.length, 250);
  assert.equal(countOriginals(result.comments, "review"), 1);
});

test("숨김 원글의 답글은 원글 없이 묶고 삭제된 자리는 유지한다", () => {
  const deleted = { ...comment(1), body: "", deleted: true };
  const threads = groupCommentThreads([comment(9, 2), comment(5, 1), deleted, comment(7, 2)]);
  assert.equal(threads.length, 2);
  const unavailable = threads.find((t) => t.id === 2)!;
  assert.equal(unavailable.root, undefined);
  assert.deepEqual(unavailable.replies.map((r) => r.id), [7, 9]);
  assert.equal(threads.find((t) => t.id === 1)?.root?.deleted, true);
  assert.equal(countOriginals([deleted, comment(2, 1), comment(3, null, "talk")], "review"), 0);
  assert.equal(countOriginals([deleted, comment(2, 1), comment(3, null, "talk")], "talk"), 1);
});

test("중간 페이지 실패는 성공한 목록처럼 다루지 않고 오류로 돌려준다", async () => {
  const result = await loadCommentFeed(async (_, after) => after === null
    ? { data: Array.from({ length: 100 }, (_, i) => comment(i + 1)), error: null }
    : { data: null, error: { code: "network", message: "failed" } });
  assert.equal(result.error?.code, "network");
});
