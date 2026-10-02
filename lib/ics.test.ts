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

test("활동 기간은 끝나는 날까지(끝 다음 날로 표시), 날짜가 없는 공고는 일정을 만들지 않는다", () => {
  const ics = buildIcs(
    [
      { ...program, id: "p2", recruitPeriod: { start: null, end: null }, activityPeriod: { start: "2026-12-30", end: "2026-12-31" } } as Program,
      { ...program, id: "p3", recruitPeriod: { start: null, end: null }, activityPeriod: { start: null, end: null } } as Program,
    ],
    "https://example.com",
  );
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 1);
  assert.match(ics, /DTSTART;VALUE=DATE:20261230/);
  assert.match(ics, /DTEND;VALUE=DATE:20270101/); // 해가 바뀌어도 맞게
  assert.match(ics, /URL:https:\/\/example\.com\/programs\/p2/);
  assert.ok(!ics.includes("p3"));
});

test("쉼표·세미콜론을 이스케이프하고, 긴 줄은 75바이트마다 나눈다 (줄 끝은 CRLF)", () => {
  const title = "취업, 창업; 특강 " + "가".repeat(60);
  const ics = buildIcs([{ ...program, title } as Program], "https://example.com");
  assert.ok(ics.includes("\\,") && ics.includes("\;"));
  const lines = ics.split("\r\n");
  for (const line of lines) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(lines.some((line) => line.startsWith(" "))); // 이어지는 줄은 공백으로 시작
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  // 나눈 줄을 다시 이으면 원래 제목이 나온다
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.includes(`SUMMARY:[마감] 취업\\, 창업\\; 특강 ${"가".repeat(60)}`));
});
