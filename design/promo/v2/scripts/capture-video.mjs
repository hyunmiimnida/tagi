// 시연 영상용 화면 상태 캡처 (휴대폰 390×844, 3배 해상도)
// 사용법: node capture-video.mjs <체험 모드 사이트 주소> <저장 폴더>
// 실제로 눌러 가며 바뀌는 화면을 한 장씩 찍고, 누른 곳(CSS px 상자)을 states.json에 남긴다.
// 영상은 이 그림들을 이어 붙이고 누른 곳에 동그라미를 그려 만든다 (scripts/compose-video.mjs)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(process.env.PLAYWRIGHT_CORE + "/");
const { chromium } = require("playwright-core");

const [BASE, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const NOW = process.env.PROMO_NOW ?? "2026-11-13T10:00:00+09:00";
const SCHOOL_NAME = "성균관대학교";
const TAG = "장학·지원금";
const DETAIL_ID = "skku-notice-140652";
// 캘린더에 미리 있는 관심 공고 (영상에서 인석장학회를 하나 더 관심 표시한다)
const FAVORITES = ["skku-notice-140524", "skku-notice-139727", "skku-notice-140777", "skku-notice-140690"];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
  colorScheme: "light",
  reducedMotion: "reduce",
});
await context.addInitScript((favorites) => {
  if (!localStorage.getItem("promo-seeded")) {
    localStorage.setItem("install-card-hidden", "1");
    localStorage.setItem("profile-nudge-hidden", "1");
    localStorage.setItem("favorites", JSON.stringify(favorites));
    localStorage.setItem("promo-seeded", "1");
  }
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = ".trial-label{visibility:hidden}.pal-peek-anchor,.key-toast{display:none!important}";
    document.head.appendChild(style);
  });
}, FAVORITES);
const page = await context.newPage();
await page.clock.setFixedTime(new Date(NOW));

const states = [];
async function go(url) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
}
// 지금 화면을 찍고, 다음에 누를 곳(locator)이 있으면 그 상자를 함께 적는다
async function shot(name, tapTarget) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(350);
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(OUT, file) });
  const tap = tapTarget ? await tapTarget.boundingBox() : null;
  states.push({ name, file, tap });
  console.log("saved", file, tap ? `tap ${Math.round(tap.x)},${Math.round(tap.y)}` : "");
}

// 1. 전체 학교 목록 → 학교 칩 누르기
await go("/programs");
const schoolChip = page.locator(".chip-scroll .chip").first();
await shot("v01-list-all", schoolChip);
await schoolChip.click();
await page.getByRole("tab", { name: "수도권" }).click().catch(() => {});
await page.waitForTimeout(400);
const school = page.getByRole("button", { name: new RegExp(SCHOOL_NAME) }).first();
await school.scrollIntoViewIfNeeded().catch(() => {});
await shot("v02-school-panel", school);
await school.click();
await page.waitForTimeout(700);
// 다른 학교도 지원할 수 있는 공고는 빼고 본다 (패널 안 스위치를 끈 것과 같은 주소)
await go("/programs?school=skku&open=0");
const tagChip = page.locator(".chip-scroll .chip", { hasText: "분야" });
await shot("v03-school-list", tagChip);

// 2. 분야 고르기
await tagChip.click();
await page.waitForTimeout(500);
const tag = page.locator(".tag-panel").getByText(TAG, { exact: false }).first();
await shot("v04-tag-panel", tag);
await tag.click();
await page.waitForTimeout(600);
await shot("v05-tag-picked");
await tagChip.click();
await page.waitForTimeout(600);
await page.evaluate(() => window.scrollTo(0, 0));
await shot("v06-tag-list");

// 3. 공고 상세 → 관심 표시 (같은 공고를 목록에서 찾기 어려우면 주소로 연다)
await go(`/programs/${DETAIL_ID}`);
const star = page.getByRole("button", { name: /관심/ }).first();
await shot("v07-detail", star);
await star.click();
await page.waitForTimeout(1500);
// 동작 줄이기에서는 별 아이콘 연출이 멈춘 채 찍혀서, 저장된 관심 표시로 다시 연 화면을 쓴다
await go(`/programs/${DETAIL_ID}`);
await shot("v08-detail-starred");

// 4. 캘린더
await go("/calendar");
await shot("v09-calendar");
await page.screenshot({ path: path.join(OUT, "v09b-calendar-full.png"), fullPage: true });

writeFileSync(path.join(OUT, "states.json"), JSON.stringify({ viewport: { width: 390, height: 844, scale: 3 }, now: NOW, states }, null, 2));
await browser.close();
