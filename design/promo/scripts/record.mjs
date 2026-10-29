// 캠퍼스모아 시연 영상용 화면 녹화 (휴대폰 390×844, 3배 해상도)
// 사용법: node record.mjs <사이트 주소> <저장 폴더>
// 체험 모드 사이트에서 실제로 눌러 가며 녹화한다: 학교 고르기 → 분야 고르기 → 공고 열기 → 관심 표시 → 캘린더
// 화면이 바뀔 때마다 그림(frames/000001.jpg …)을 저장하고, 장면 시각은 scenes.json, 그림별 길이는 frames.txt(ffmpeg concat)에 남긴다.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3210";
const OUT = process.argv[3] ?? "recording";
const FRAMES = path.join(OUT, "frames");
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const SCHOOL_NAME = "성균관대학교";
const TAG = "장학·지원금";
const PROGRAM = "2027년도 두산연강재단 장학생 선발 안내";

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
  colorScheme: "light",
});
await context.addInitScript(() => {
  if (!localStorage.getItem("promo-seeded")) {
    localStorage.setItem("install-card-hidden", "1");
    localStorage.setItem("profile-nudge-hidden", "1");
    localStorage.setItem("promo-seeded", "1");
  }
  // 체험 모드 표시는 캡처에서만 숨기고, 누른 곳을 옅은 동그라미로 보여 준다
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = `.trial-label{visibility:hidden}
      .promo-tap{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(25,31,40,.18);pointer-events:none;z-index:99999;transition:opacity .35s, transform .35s}`;
    document.head.appendChild(style);
  });
  window.__promoTap = (x, y) => {
    const dot = document.createElement("div");
    dot.className = "promo-tap";
    dot.style.left = x + "px";
    dot.style.top = y + "px";
    document.body.appendChild(dot);
    setTimeout(() => { dot.style.opacity = "0"; dot.style.transform = "scale(1.4)"; }, 250);
    setTimeout(() => dot.remove(), 700);
  };
});
const page = await context.newPage();
// 화면 속 날짜: 두산연강재단 장학생 마감(11.13) 하루 전 → "내일 마감" 알림 이야기와 맞춘다
await page.clock.setFixedTime(new Date(process.env.PROMO_NOW ?? "2026-11-12T10:00:00+09:00"));

// 화면 녹화 시작 (바뀔 때마다 그림이 온다)
const cdp = await context.newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = String(frames.length + 1).padStart(6, "0") + ".jpg";
  writeFileSync(path.join(FRAMES, file), Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});

const scenes = [];
let start = 0;
const now = () => Date.now() / 1000;
const mark = (name) => scenes.push({ name, t: +(now() - start).toFixed(2) });
const wait = (ms) => page.waitForTimeout(ms);

async function tap(locator, pause = 700) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(([x, y]) => window.__promoTap(x, y), [x, y]);
  await wait(180);
  await locator.click();
  await wait(pause);
}

// 부드럽게 내려 보기
async function smoothScrollTo(locator) {
  const target = await locator.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 220);
  await page.evaluate((top) => window.scrollTo({ top, behavior: "smooth" }), target);
  await wait(1400);
}

// open=0: 다른 학교에 올라온 공고는 빼고 고른 학교 공고만 보이게
await page.goto(BASE + "/programs?open=0", { waitUntil: "networkidle" });
await wait(800);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1170, maxHeight: 2532, everyNthFrame: 1 });
start = now();
await page.mouse.move(0, 0);

mark("list");
await wait(1200);

mark("school");
await tap(page.locator(".chip-scroll .chip").first());
await tap(page.getByRole("tab", { name: "수도권" }));
await tap(page.locator(".tag-panel").getByText(SCHOOL_NAME, { exact: false }).first(), 900);
await tap(page.locator(".chip-scroll .chip").first(), 900); // 패널 닫기

mark("tag");
await tap(page.locator(".chip-scroll .chip", { hasText: "분야" }));
await tap(page.locator(".tag-panel").getByText(TAG, { exact: false }).first(), 900);
await tap(page.locator(".chip-scroll .chip", { hasText: "분야" }), 900); // 패널 닫기

mark("open");
const row = page.getByText(PROGRAM, { exact: true }).first();
await smoothScrollTo(row);
await wait(400);
await tap(row, 1600);

mark("favorite");
await tap(page.locator(".detail-actions .favorite"), 3800); // 캐릭터가 별을 켜는 동작까지 기다린다

mark("calendar");
await tap(page.locator("nav a", { hasText: "캘린더" }), 1200);
await tap(page.locator(".day", { hasText: /^13/ }).first(), 2600);
mark("end");

await cdp.send("Page.stopScreencast");
await wait(300);
await browser.close();

// 그림별 길이를 적어 ffmpeg가 실제 시간대로 이어 붙이게 한다
const t0 = frames[0].t;
const lines = [];
frames.forEach((f, i) => {
  const next = i + 1 < frames.length ? frames[i + 1].t : f.t + 0.5;
  lines.push(`file 'frames/${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
});
lines.push(`file 'frames/${frames.at(-1).file}'`);
writeFileSync(path.join(OUT, "frames.txt"), lines.join("\n") + "\n");
// 장면 시각(scenes)은 녹화 시작 기준, 첫 그림 시각과의 차이는 firstFrameEpoch - startEpoch
writeFileSync(path.join(OUT, "scenes.json"), JSON.stringify({ firstFrameEpoch: t0, startEpoch: start, scenes }, null, 2));
console.log(`그림 ${frames.length}장, 길이 ${(frames.at(-1).t - t0).toFixed(1)}초`, scenes);
