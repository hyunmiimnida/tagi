import { SITE_URL } from "../lib/filter.ts";
import { CONTACT_EMAIL } from "../lib/policy.ts";

// 수집기 이름. 학교가 연락할 수 있게 운영 연락처(lib/policy.ts)와 사이트 주소(lib/filter.ts)를 함께 적는다
const USER_AGENT = `campus-info-hub-collector/0.1 (+mailto:${CONTACT_EMAIL}; ${SITE_URL})`;
const DELAY_MS = 1000; // 사이트에 부담을 주지 않도록 요청 사이에 쉬는 시간

// 사이트(호스트)마다 요청을 한 줄로 세워 1초씩 띄운다. 서로 다른 학교 사이트는 동시에 읽어도 된다
const queues = new Map<string, Promise<unknown>>();
// robots.txt의 Crawl-delay(초): 이 값이 있으면 그 사이트는 요청 사이를 그만큼 띄운다 (너무 큰 값은 60초까지만)
const crawlDelays = new Map<string, number>();
const MAX_CRAWL_DELAY_S = 60;

// redirect "manual": 다른 주소로 보내는 응답(3xx)을 따라가지 않고 그대로 돌려준다 (followFetch가 robots.txt를 확인하고 따라간다)
function politeFetch(url: string, redirect: RequestRedirect = "follow"): Promise<Response> {
  const host = new URL(url).host;
  const turn = (queues.get(host) ?? Promise.resolve()).then(async () => {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
      redirect,
    });
    const wait = Math.max(DELAY_MS, Math.min(crawlDelays.get(host) ?? 0, MAX_CRAWL_DELAY_S) * 1000);
    await new Promise((r) => setTimeout(r, wait)); // 다음 요청까지 쉰다
    return response;
  });
  queues.set(host, turn.catch(() => {}));
  return turn;
}

// robots.txt가 막은 주소를 읽으려 하면 나는 오류. 수집기는 이 글만 건너뛰고 계속한다
export class RobotsBlockedError extends Error {
  url: string;
  constructor(url: string) {
    super(`robots.txt가 막은 주소라 읽지 않음: ${url}`);
    this.url = url;
  }
}

// robots.txt를 받지 못해(접속 오류·응답 오류) 이 주소를 읽어도 되는지 모를 때 나는 오류.
// 막힌 것(RobotsBlockedError)과 달리 수집 실패로 기록한다 (수집 점검이 알리게)
export class RobotsUnavailableError extends Error {
  url: string;
  constructor(url: string, reason: string) {
    super(`robots.txt를 확인하지 못해 읽지 않음: ${url} (${reason})`);
    this.url = url;
  }
}

// 이번 실행에서 robots.txt 때문에 건너뛴 주소 (수집 기록에 남긴다)
export const robotsBlocked: string[] = [];

// 이 주소를 읽어도 되는지 확인한다. 막혔으면 RobotsBlockedError, 확인하지 못했으면 RobotsUnavailableError
async function checkRobots(url: string): Promise<void> {
  if (await isAllowedByRobots(url)) return;
  const problem = robotsProblemOf(url);
  if (problem) throw new RobotsUnavailableError(url, problem);
  robotsBlocked.push(url);
  throw new RobotsBlockedError(url);
}

// 다른 주소로 보내면(3xx) 그 주소도 robots.txt를 확인하고, 그 사이트의 요청 간격을 지키며 따라간다 (최대 5번)
const MAX_REDIRECTS = 5;
async function followFetch(url: string, hops = 0): Promise<Response> {
  const res = await politeFetch(url, "manual");
  const location = res.headers.get("location");
  if (res.status < 300 || res.status >= 400 || !location) return res;
  if (hops >= MAX_REDIRECTS) throw new Error(`${url} 다른 주소로 너무 많이 보냄`);
  const next = new URL(location, url).href;
  await checkRobots(next);
  return followFetch(next, hops + 1);
}

export async function fetchHtml(url: string): Promise<string> {
  await checkRobots(url);
  const res = await followFetch(url);
  if (!res.ok) throw new Error(`${url} 응답 오류 (${res.status})`);
  return res.text();
}

// 본문 그림(포스터) 받기. robots.txt가 막았거나, 그림이 아니거나, 너무 크면 null
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// (robots.txt가 막은 그림은 글이 아니라서 robotsBlocked에 남기지 않는다)
export async function fetchImage(url: string): Promise<{ data: Buffer; type: string } | null> {
  if (!(await isAllowedByRobots(url))) return null;
  const res = await followFetch(url).catch(() => null);
  const type = res?.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!res?.ok || !/^image\/(png|jpeg|gif|webp)$/.test(type)) return null;
  const data = Buffer.from(await res.arrayBuffer());
  return data.length > MAX_IMAGE_BYTES ? null : { data, type };
}

interface RobotsRule {
  allow: boolean;
  value: string;
  pattern: RegExp;
}

// robots.txt 글에서 "User-agent: *" 묶음의 규칙만 뽑는다.
// User-agent 줄이 연달아 나오면 한 묶음이다 (예: "User-agent: a" 다음 "User-agent: *")
export function parseRobots(text: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (key === "user-agent") {
      if (inRules) agents = [];
      inRules = false;
      agents.push(value);
    } else if (key === "disallow" || key === "allow") {
      inRules = true;
      if (!agents.includes("*") || !value) continue; // 빈 Disallow는 "모두 허용"이라 규칙이 없는 것과 같다
      const pattern = new RegExp(
        "^" + value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"),
      );
      rules.push({ allow: key === "allow", value, pattern });
    }
  }
  return rules;
}

// "User-agent: *" 묶음의 Crawl-delay(초). 없으면 null
export function parseCrawlDelay(text: string): number | null {
  let agents: string[] = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (key === "user-agent") {
      if (inRules) agents = [];
      inRules = false;
      agents.push(value);
    } else {
      inRules = true;
      const seconds = Number(value);
      if (key === "crawl-delay" && agents.includes("*") && Number.isFinite(seconds) && seconds > 0) return seconds;
    }
  }
  return null;
}

// 가장 길게 일치하는 규칙을 따른다. 일치하는 규칙이 없으면 허용
export function robotsAllows(rules: RobotsRule[], path: string): boolean {
  let best = { length: -1, allow: true };
  for (const rule of rules) {
    if (rule.pattern.test(path) && rule.value.length > best.length) best = { length: rule.value.length, allow: rule.allow };
  }
  return best.allow;
}

// 사이트마다 robots.txt를 한 번만 받아 기억한다. null = 확인할 수 없어 수집하지 않음
const robotsCache = new Map<string, Promise<RobotsRule[] | null>>();
// robots.txt를 확인하지 못한 사이트와 그 이유 ("막음"과 구별해 수집 기록에 실패로 남긴다)
export const robotsProblems = new Map<string, string>();
const ROBOTS_TRIES = 3;
const ROBOTS_RETRY_MS = 5000;

async function fetchRobots(origin: string): Promise<RobotsRule[] | null> {
  let reason = "";
  for (let attempt = 1; attempt <= ROBOTS_TRIES; attempt++) {
    try {
      const res = await politeFetch(`${origin}/robots.txt`);
      if (res.status === 404) return []; // robots.txt가 없으면 제한 없음
      if (res.ok) {
        const text = await res.text();
        const delay = parseCrawlDelay(text);
        if (delay) crawlDelays.set(new URL(origin).host, delay);
        return parseRobots(text);
      }
      reason = `응답 ${res.status}`;
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    // 잠깐의 접속 오류일 수 있어 조금 쉬고 다시 받아 본다
    if (attempt < ROBOTS_TRIES) await new Promise((r) => setTimeout(r, ROBOTS_RETRY_MS * attempt));
  }
  robotsProblems.set(origin, reason);
  return null; // 끝내 확인할 수 없으면 수집하지 않는다
}

function robotsOf(origin: string): Promise<RobotsRule[] | null> {
  let rules = robotsCache.get(origin);
  if (!rules) {
    rules = fetchRobots(origin);
    robotsCache.set(origin, rules);
  }
  return rules;
}

// 이 주소의 robots.txt를 확인하지 못했으면 그 이유 (막힌 것과 구별할 때)
export const robotsProblemOf = (url: string) => robotsProblems.get(new URL(url).origin);

// robots.txt의 "User-agent: *" 규칙에서 이 주소의 자동 접근이 허용되는지 확인한다
export async function isAllowedByRobots(url: string): Promise<boolean> {
  const target = new URL(url);
  const rules = await robotsOf(target.origin);
  return rules !== null && robotsAllows(rules, target.pathname + target.search);
}
