import assert from "node:assert/strict";
import test from "node:test";
import { buildIcs } from "./ics.ts";
import type { Program } from "../src/types.ts";

const program = {
  id: "p1",
  title: "서포터즈 모집",
  recruitPeriod: { start: null, end: "2026-10-10" },
  activityPeriod: { start: "2026-10-20", end: null },
} as unknown as Program;

test("마감 일정에만 하루 전 오전 9시 알림을 단다", () => {
  const ics = buildIcs([program], "https://example.com");
  assert.equal(ics.match(/BEGIN:VALARM/g)?.length, 1);
  assert.match(ics, /TRIGGER:-PT15H/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261010/);
  assert.match(ics, /DTEND;VALUE=DATE:20261021/);
});
