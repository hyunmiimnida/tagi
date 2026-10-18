import assert from "node:assert/strict";
import { test } from "node:test";
import { safePostId } from "./types.ts";

test("글 번호가 숫자·영문이면 그대로, 제목 글자(%EA…)면 짧은 해시로 바꾼다", () => {
  assert.equal(safePostId("1511306"), "1511306");
  assert.equal(safePostId("000100000000003775"), "000100000000003775");
  const slug = "%EA%B2%A8%EC%9A%B8-%EB%8B%A8%EA%B8%B0-%EC%9D%BC%EB%B3%B8-sapporo";
  const id = safePostId(slug);
  assert.match(id, /^h[0-9a-z]+$/);
  assert.equal(id, safePostId(slug)); // 같은 글은 늘 같은 id
  assert.notEqual(id, safePostId(`${slug}-2`));
});
