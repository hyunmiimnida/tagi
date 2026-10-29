import assert from "node:assert/strict";
import test from "node:test";
import { parseCrawlDelay, parseRobots, robotsAllows } from "./fetch.ts";

test("robots.txt: 모든 수집기(*) 묶음의 규칙만 따르고, 가장 길게 일치하는 규칙이 이긴다", () => {
  const rules = parseRobots(
    [
      "User-agent: GPTBot",
      "Disallow: /",
      "",
      "User-agent: Yeti",
      "User-agent: *",
      "Disallow: /H*",
      "Disallow: /bbs/login.php",
      "Allow: /HOME/public/",
      "Disallow:",
    ].join("\r\n"),
  );
  assert.ok(robotsAllows(rules, "/wbbs/list.action?bbs_cde=1"));
  assert.ok(!robotsAllows(rules, "/HOME/cns/index.htm"));
  assert.ok(robotsAllows(rules, "/HOME/public/a.htm"));
  assert.ok(!robotsAllows(rules, "/bbs/login.php"));
  assert.ok(robotsAllows(rules, "/bbs/board.php?bo_table=noti2"));
});

test("robots.txt: Disallow: / 는 전부 막고, 다른 수집기 전용 규칙은 무시한다", () => {
  assert.ok(!robotsAllows(parseRobots("User-agent: *\nDisallow: /"), "/anything"));
  assert.ok(robotsAllows(parseRobots("User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nDisallow: /data/"), "/news"));
  assert.ok(robotsAllows(parseRobots(""), "/news"));
});

test("Crawl-delay는 * 묶음 값만 읽는다", () => {
  assert.equal(parseCrawlDelay("User-agent: *\nCrawl-delay: 10\nDisallow: /_attach/"), 10);
  assert.equal(parseCrawlDelay("User-agent: Yeti\nCrawl-delay: 30\n\nUser-agent: *\nDisallow: /x"), null);
  assert.equal(parseCrawlDelay("User-agent: Googlebot\nUser-agent: *\nCrawl-delay: 2.5"), 2.5);
  assert.equal(parseCrawlDelay("User-agent: *\nDisallow:"), null);
});

// 가짜 사이트: 주소마다 정해 둔 응답을 돌려준다 (실제 학교 사이트에 요청하지 않는다)
function fakeSite(pages: Record<string, () => Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const page = pages[url];
    if (!page) return new Response("없음", { status: 404 });
    return page();
  }) as typeof fetch;
  return () => (globalThis.fetch = original);
}
const moved = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });

test("다른 주소로 보내면 그 주소도 robots.txt를 확인한다 (막힌 곳으로 보내면 읽지 않음)", async () => {
  const { fetchHtml, RobotsBlockedError } = await import("./fetch.ts");
  const restore = fakeSite({
    "https://redirect-a.test/robots.txt": () => new Response("User-agent: *\nDisallow: /private/"),
    "https://redirect-a.test/notice/1": moved("/private/1"),
    "https://redirect-a.test/notice/2": moved("https://redirect-a.test/ok/2"),
    "https://redirect-a.test/ok/2": () => new Response("<p>본문</p>"),
  });
  try {
    await assert.rejects(fetchHtml("https://redirect-a.test/notice/1"), RobotsBlockedError);
    assert.equal(await fetchHtml("https://redirect-a.test/notice/2"), "<p>본문</p>");
  } finally {
    restore();
  }
});

test("robots.txt를 받지 못한 사이트의 글은 '막힘'이 아니라 '확인 실패'로 알린다", async () => {
  const { fetchHtml, RobotsUnavailableError, robotsBlocked } = await import("./fetch.ts");
  const restore = fakeSite({ "https://robots-down.test/robots.txt": () => new Response("오류", { status: 500 }) });
  try {
    await assert.rejects(fetchHtml("https://robots-down.test/notice/1"), RobotsUnavailableError);
    assert.ok(!robotsBlocked.includes("https://robots-down.test/notice/1"));
  } finally {
    restore();
  }
});
