const USER_AGENT = "campus-info-hub-collector/0.1";
const DELAY_MS = 1000; // 사이트에 부담을 주지 않도록 요청 사이에 쉬는 시간

let lastRequestAt = 0;

async function politeFetch(url: string): Promise<Response> {
  const wait = lastRequestAt + DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
}

export async function fetchHtml(url: string): Promise<string> {
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`${url} 응답 오류 (${res.status})`);
  return res.text();
}

// robots.txt의 "User-agent: *" 규칙에서 이 주소의 자동 접근이 허용되는지 확인한다.
export async function isAllowedByRobots(url: string): Promise<boolean> {
  const target = new URL(url);
  const res = await politeFetch(new URL("/robots.txt", target).href);
  if (res.status === 404) return true; // robots.txt가 없으면 제한 없음
  if (!res.ok) return false; // 확인할 수 없으면 수집하지 않는다

  const path = target.pathname + target.search;
  let applies = false;
  let best = { length: -1, allow: true }; // 가장 길게 일치하는 규칙이 우선

  for (const raw of (await res.text()).split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (key === "user-agent") {
      applies = value === "*";
    } else if (applies && (key === "disallow" || key === "allow") && value) {
      const pattern = new RegExp(
        "^" + value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"),
      );
      if (pattern.test(path) && value.length > best.length) {
        best = { length: value.length, allow: key === "allow" };
      }
    }
  }
  return best.allow;
}
