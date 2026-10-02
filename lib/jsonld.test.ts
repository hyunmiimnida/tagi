import assert from "node:assert/strict";
import test from "node:test";
import { SITE_URL } from "./filter.ts";
import { jsonLdScript, programJsonLd } from "./jsonld.ts";
import type { Program } from "../src/types.ts";

const base: Program = {
  id: "knu-1",
  title: "창업 아이디어 경진대회",
  organizer: "경북대학교 창업지원단",
  organizerType: "학교",
  target: { schools: ["knu"], colleges: [], departments: [], grades: [] },
  recruitPeriod: { start: "2026-10-01", end: "2026-10-15" },
  activityPeriod: { start: "2026-11-02", end: "2026-11-03" },
  tags: ["창업", "공모전·대회"],
  links: [{ sourceId: "knu-startup", url: "https://example.ac.kr/notice/1" }],
  sources: ["knu-startup"],
  postedAt: "2026-09-30",
  extractedBy: "ai",
  collectedAt: "2026-09-30T01:00:00.000Z",
  summary: "창업 아이디어를 겨루는 교내 대회",
};

test("활동 날짜가 있으면 Event: 활동 기간, 모집 기간(신청 창구), 주최, 원문 주소", () => {
  const data = programJsonLd(base);
  assert.equal(data["@type"], "Event");
  assert.equal(data.startDate, "2026-11-02");
  assert.equal(data.endDate, "2026-11-03");
  assert.deepEqual(data.organizer, { "@type": "Organization", name: "경북대학교 창업지원단" });
  assert.deepEqual(data.offers, { "@type": "Offer", url: "https://example.ac.kr/notice/1", validFrom: "2026-10-01", validThrough: "2026-10-15" });
  assert.deepEqual(data.sameAs, ["https://example.ac.kr/notice/1"]);
  assert.equal(data.url, `${SITE_URL}/programs/knu-1`);
});

test("모르는 날짜·주최는 추측하지 않고 칸을 뺀다", () => {
  const data = programJsonLd({
    ...base,
    organizer: null,
    summary: null,
    recruitPeriod: { start: null, end: null },
    activityPeriod: { start: "2026-11-02", end: null },
  });
  assert.equal(data["@type"], "Event");
  for (const key of ["endDate", "organizer", "offers", "description"]) assert.ok(!(key in data), `${key}가 없어야 함`);
});

test("활동 날짜가 없으면 공고문(CreativeWork): 게시일과 모집 마감만", () => {
  const data = programJsonLd({ ...base, activityPeriod: { start: null, end: null } });
  assert.equal(data["@type"], "CreativeWork");
  assert.equal(data.datePublished, "2026-09-30");
  assert.equal(data.expires, "2026-10-15");
  assert.ok(!("startDate" in data));

  const bare = programJsonLd({ ...base, postedAt: null, recruitPeriod: { start: null, end: null }, activityPeriod: { start: null, end: null } });
  assert.ok(!("datePublished" in bare) && !("expires" in bare));
});

test("http(s)가 아닌 원문 주소는 넣지 않는다", () => {
  const data = programJsonLd({ ...base, links: [{ sourceId: "x", url: "javascript:alert(1)" }] });
  assert.ok(!("sameAs" in data));
  assert.ok(!("url" in (data.offers as object)));
});

test("script 태그 안에서 끊기지 않게 < > &를 바꾼다", () => {
  const text = jsonLdScript(programJsonLd({ ...base, title: "</script><b>A&B</b>" }));
  assert.ok(!text.includes("</script>") && !text.includes("<") && !text.includes("&"));
  assert.equal((JSON.parse(text) as { name: string }).name, "</script><b>A&B</b>");
});
