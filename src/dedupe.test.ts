import assert from "node:assert/strict";
import test from "node:test";
import { mergePair } from "./dedupe.ts";
import type { Program } from "./types.ts";

const program = (id: string, openTo?: string | null): Program => ({
  id,
  title: "2026 대학생 서포터즈 모집",
  organizer: null,
  organizerType: null,
  target: { schools: ["yu"], colleges: [], departments: [], grades: [], statuses: [], excludedStatuses: [], openTo },
  recruitPeriod: { start: null, end: null },
  activityPeriod: { start: null, end: null },
  tags: [],
  links: [{ sourceId: id, url: `https://example.com/${id}` }],
  sources: [id],
  postedAt: null,
  extractedBy: "ai",
  collectedAt: "2026-10-01T00:00:00Z",
});

test("합쳐져 없어진 공고의 id를 기억한다", () => {
  const a = program("a");
  const b = { ...program("b"), aliases: ["c"] };
  const [merged] = mergePair([a, b], a, b);
  assert.deepEqual(merged.aliases, ["b", "c"]);
});

test("어느 한쪽이라도 다른 학교 학생에게 열려 있으면 열린 공고로 합친다", () => {
  const a = program("a", null);
  const b = { ...program("b", "전국 대학생"), target: { ...program("b").target, schools: [], openTo: "전국 대학생" } };
  const [merged] = mergePair([a, b], a, b);
  assert.equal(merged.target.openTo, "전국 대학생");
  assert.deepEqual(merged.target.schools, []);
});
