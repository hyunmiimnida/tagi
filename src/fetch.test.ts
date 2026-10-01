import assert from "node:assert/strict";
import test from "node:test";
import { parseRobots, robotsAllows } from "./fetch.ts";

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
