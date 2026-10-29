// 캠퍼스모아 홍보용 화면 캡처 (휴대폰 390×844, 3배 해상도 → 1170×2532)
// 사용법: node capture.mjs <사이트 주소> <저장 폴더>
// 로그인 없는 "체험 모드" 사이트(Supabase 설정 없이 빌드)를 띄워 놓고 실행한다.
// 관심 공고·학교·프로필은 브라우저 저장소에 미리 넣어 두고, 개인 정보는 화면에 나오지 않는다.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3210";
const OUT = process.argv[3] ?? "raw";
const CHROME = process.env.CHROME_PATH;
mkdirSync(OUT, { recursive: true });

// 데모 시나리오: 성균관대 학생, 장학·지원금 관심
export const SCHOOL = "skku";
export const DETAIL_ID = "skku-notice-140562"; // 2027년도 두산연강재단 장학생 선발 안내
const FAVORITES = [DETAIL_ID, "skku-notice-140597", "skku-notice-140686", "skku-notice-140671", "skku-notice-140524"];
const PROFILE = { status: null, grade: null, interests: ["장학·지원금", "공모전·대회"], notifyDeadline: true, nickname: null };

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
  colorScheme: "light",
  reducedMotion: "reduce", // 사진은 캐릭터가 움직이지 않는 모습으로
});
await context.addInitScript(
  ({ school, favorites, profile }) => {
    if (localStorage.getItem("promo-seeded")) return;
    localStorage.setItem("schoolId", school);
    localStorage.setItem("favorites", JSON.stringify(favorites));
    localStorage.setItem("profile", JSON.stringify(profile));
    localStorage.setItem("install-card-hidden", "1");
    localStorage.setItem("profile-nudge-hidden", "1");
    localStorage.setItem("promo-seeded", "1");
  },
  { school: SCHOOL, favorites: FAVORITES, profile: PROFILE },
);
// 체험 모드 표시는 실제 사용자에게 보이지 않으므로(로그인 버튼이 보임) 캡처에서만 숨긴다
await context.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = ".trial-label{visibility:hidden}";
    document.head.appendChild(style);
  });
});
const page = await context.newPage();
// 화면 속 날짜를 데이터를 마지막으로 모은 날 오후로 맞춘다 (홈의 "오늘 올라온 공고"가 비지 않게)
const NOW = process.env.PROMO_NOW ?? "2026-10-29T15:00:00+09:00";
await page.clock.setFixedTime(new Date(NOW));

async function go(url) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
}
async function shot(name) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, name) });
  console.log("saved", name);
}

// 1. 홈
await go("/");
await shot("01-home.png");

// 2. 공고 목록 — 학교 필터 패널 (수도권 탭, 성균관대 선택)
await go(`/programs?school=${SCHOOL}`);
await page.locator(".chip-scroll .chip").first().click();
await page.getByRole("tab", { name: "수도권" }).click().catch(() => {});
await shot("02-school-filter.png");

// 3. 공고 목록 — 분야 태그 고르기 (장학·지원금)
await go(`/programs?school=${SCHOOL}&open=0`);
await page.locator(".chip-scroll .chip", { hasText: "분야" }).click();
await page.locator(".tag-panel").getByText("장학·지원금", { exact: false }).first().click();
await shot("03-tag-filter.png");
// 패널을 닫은 목록 모습도 남긴다
await page.locator(".chip-scroll .chip", { hasText: "분야" }).click();
await shot("03b-tag-list.png");

// 4. 공고 상세
await go(`/programs/${DETAIL_ID}`);
await shot("04-detail.png");

// 5. 캘린더 (관심 공고 일정) — 11월로 넘긴다
await go("/calendar");
const next = page.getByRole("button", { name: /다음 달/ });
if (await next.count()) await next.first().click();
await shot("05-calendar.png");
await page.screenshot({ path: path.join(OUT, "05b-calendar-full.png"), fullPage: true });

// 6. 프로필 — 알림과 캘린더 설정
await go("/my");
await shot("06-my.png");
await page.screenshot({ path: path.join(OUT, "06b-my-full.png"), fullPage: true });

await browser.close();
