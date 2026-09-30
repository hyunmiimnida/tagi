import assert from "node:assert/strict";
import test from "node:test";
import { matchesTags } from "./filter.ts";

const categories = [
  { id: "field", name: "분야", tags: ["취업·채용", "창업"] },
  { id: "format", name: "활동 형태", tags: ["교육·특강", "공모전·대회"] },
];

test("같은 카테고리는 또는, 다른 카테고리는 그리고로 필터링한다", () => {
  const tags = ["취업·채용", "교육·특강"];
  assert.ok(matchesTags(tags, new Set(), categories));
  assert.ok(matchesTags(tags, new Set(["취업·채용", "창업"]), categories));
  assert.ok(matchesTags(tags, new Set(["창업", "취업·채용", "교육·특강"]), categories));
  assert.ok(!matchesTags(tags, new Set(["창업"]), categories));
  assert.ok(!matchesTags(tags, new Set(["취업·채용", "공모전·대회"]), categories));
});

test("날짜를 짧게 보여 준다", async () => {
  const { formatPeriod } = await import("./filter.ts");
  assert.equal(formatPeriod({ start: "2026-10-07", end: "2026-10-07" }, 2026), "10.7(수)");
  assert.equal(formatPeriod({ start: null, end: "2026-10-05" }, 2026), "~ 10.5(월)");
  assert.equal(formatPeriod({ start: "2026-12-20", end: "2027-01-10" }, 2026), "12.20(일) ~ 2027.1.10(일)");
  assert.equal(formatPeriod({ start: null, end: null }, 2026), null);
});
