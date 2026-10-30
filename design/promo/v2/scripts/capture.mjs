// 캠퍼스모아 홍보물 v2 화면 캡처 (휴대폰 390×844, 3배 해상도 → 1170×2532)
// 사용법: node capture.mjs <배포 사이트 주소> <체험 모드 사이트 주소> <저장 폴더>
// - 목록·상세는 배포된 사이트에서 로그인 없이 찍는다
// - 관심 공고·캘린더는 로그인이 필요해서, Supabase 설정 없이 빌드한 "체험 모드" 사이트에서 찍는다
// 화면 속 날짜는 PROMO_NOW(기본 2026-11-13)로 고정: 올릴 즈음에도 지난 공고가 보이지 않게
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
const require = createRequire(process.env.PLAYWRIGHT_CORE + "/");
const { chromium } = require("playwright-core");

const [LIVE, TRIAL, OUT] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const NOW = process.env.PROMO_NOW ?? "2026-11-13T10:00:00+09:00";

const SCHOOL = "skku";
const TAG = encodeURIComponent("장학·지원금");
const DETAIL_ID = "skku-notice-140652"; // 재단법인 인석장학회 장학생 선발 (연간 400만원, ~11.26)
// 캘린더에 모일 관심 공고: 장학금·공모전·문화패스 (모두 11월 중순 이후 마감)
const FAVORITES = [
  "skku-notice-140524", // STX장학재단 장학생 (~11.16)
  DETAIL_ID,
  "skku-notice-139727", // 서울청년문화패스 (~11.30)
  "skku-notice-140777", // 사회보장 데이터 AI 아이디어 경진대회 (~11.20)
  "skku-notice-140690", // 캠퍼스 탄소중립 아이디어 공모전 (~11.18)
];
const PROFILE = { status: null, grade: null, interests: ["장학·지원금", "공모전·대회"], notifyDeadline: true, nickname: null };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });

async function newPage({ seed }) {
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
  await context.addInitScript(
    ({ seed, school, favorites, profile }) => {
      localStorage.setItem("install-card-hidden", "1");
      localStorage.setItem("profile-nudge-hidden", "1");
      if (seed && !localStorage.getItem("promo-seeded")) {
        localStorage.setItem("schoolId", school);
        localStorage.setItem("favorites", JSON.stringify(favorites));
        localStorage.setItem("profile", JSON.stringify(profile));
        localStorage.setItem("promo-seeded", "1");
      }
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        // 체험 모드 표시, 공고 글자를 가리던 빼꼼 캐릭터, 사이트 공지 띠는 홍보 사진에서 뺀다
        style.textContent = ".trial-label{visibility:hidden}.pal-peek-anchor,.key-toast{display:none!important}";
        document.head.appendChild(style);
      });
    },
    { seed, school: SCHOOL, favorites: FAVORITES, profile: PROFILE },
  );
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  return page;
}

async function go(page, base, url) {
  await page.goto(base + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
}
async function shot(page, name, options = {}) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, name), ...options });
  console.log("saved", name);
}

// 배포 사이트 (로그인 안 한 상태)
const live = await newPage({ seed: false });

// 1. 학교 고르기 패널: 위쪽(지역 탭과 처음 몇 줄)만 쓴다. 아래쪽은 휴대폰에서 화면 밖에 남는 버그가 있어서 쓰지 않는다
await go(live, LIVE, `/programs?school=${SCHOOL}&open=0`);
await live.locator(".chip-scroll .chip").first().click();
await live.getByRole("tab", { name: "수도권" }).click().catch(() => {});
await shot(live, "01-school-panel.png");

// 2. 학교만 고른 목록
await go(live, LIVE, `/programs?school=${SCHOOL}&open=0`);
await shot(live, "02-school-list.png");

// 3. 분야 고르기 패널 (장학·지원금)
await go(live, LIVE, `/programs?school=${SCHOOL}&open=0`);
await live.locator(".chip-scroll .chip", { hasText: "분야" }).click();
await live.locator(".tag-panel").getByText("장학·지원금", { exact: false }).first().click();
await shot(live, "03-tag-panel.png");
// 패널을 닫은 결과 목록
await live.locator(".chip-scroll .chip", { hasText: "분야" }).click();
await shot(live, "04-tag-list.png");
await shot(live, "04b-tag-list-full.png", { fullPage: true });

// 4. 공고 상세
await go(live, LIVE, `/programs/${DETAIL_ID}`);
await shot(live, "05-detail.png");
await shot(live, "05b-detail-full.png", { fullPage: true });

// 체험 모드 사이트 (관심 공고가 이 브라우저에 저장됨). 주소 자리에 "-"를 주면 건너뛴다
if (TRIAL === "-") {
  await browser.close();
  process.exit(0);
}
const trial = await newPage({ seed: true });
await go(trial, TRIAL, `/programs/${DETAIL_ID}`);
await shot(trial, "06-detail-favorited.png");

await go(trial, TRIAL, "/calendar");
await shot(trial, "07-calendar.png");
await shot(trial, "07b-calendar-full.png", { fullPage: true });

await go(trial, TRIAL, "/my");
await shot(trial, "08-my-full.png", { fullPage: true });

await browser.close();
