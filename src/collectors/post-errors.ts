import { RobotsBlockedError } from "../fetch.ts";
import type { CollectContext } from "../types.ts";

// 글 하나를 읽다 난 오류를 처리한다.
// robots.txt가 막은 글은 조용히 건너뛴다(fetch.ts가 기록). 다른 오류(접속 오류·robots.txt 확인 실패 등)는
// ctx.onPostError로 알리고 그 글만 건너뛴다 — 글 하나 때문에 이번에 읽은 그 게시판 결과를 모두 버리지 않게.
// onPostError가 없으면(과거 글 쌓기·검사) 지금처럼 오류를 그대로 던진다
export function skipPost(ctx: CollectContext, url: string, error: unknown): null {
  if (error instanceof RobotsBlockedError) return null;
  if (!ctx.onPostError) throw error;
  ctx.onPostError(url, error);
  return null;
}
