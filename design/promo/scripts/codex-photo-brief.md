Codex에게 준 작업 지시 (사진 합치기)

You are working in the folder design/promo (cwd). Write two files only:
- scripts/photo.html  — one HTML template for an Instagram feed image, exactly 1080x1350 CSS px.
- scripts/compose-photos.mjs — a Node ESM script that renders 5 images with Playwright.

Do NOT run anything that needs network or a browser. Do not touch files outside design/promo.

## Look (very important: plain, like the app itself — no "AI look")
- Background solid #f2f4f6. No gradients, no glow, no sparkles, no 3D, no emoji, no English slogans, no device mockup frame.
- Font: Pretendard Variable from
  https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css
  with fallback "Malgun Gothic", sans-serif. Wait for document.fonts.ready before screenshot.
- Colors only: text #191f28, secondary text #4e5968, muted #636c78, line #e5e8eb, white #ffffff, accent blue #1c68e3 (use sparingly: only one highlighted word in the title, given as data), red #d22636 not used.
- Layout (left aligned, side padding 88px):
  - Top row at y=72: app icon (raw/app-icon-192.png, 44px, radius 11px) + "캠퍼스모아" (28px, weight 700, #191f28) on the left; "tagi-ten.vercel.app" (24px, #636c78) on the right.
  - Title at y≈170: 64px, weight 800, letter-spacing -0.02em, line-height 1.25, color #191f28, max 2 lines; part of it wrapped in <em> rendered as accent blue, not italic.
  - Subtitle below title, 16px gap: 32px, weight 500, #4e5968, one line.
  - Phone screenshot: centered horizontally, width 640px, top at y=430 (or right after subtitle + 56px, whichever is larger), and it runs off the bottom edge (cropped by the canvas). Rounded top corners 44px, 2px border #e5e8eb (no bottom border visible), no drop shadow or at most `0 8px 24px rgba(0,0,0,0.06)`. Image is 1170x2532 so at 640px wide it is scaled; use object-fit/top alignment so the TOP of the screenshot is shown.
  - Optional overlay "notification card" (only for slide 5): a white rounded card (radius 28px) 760px wide, centered, placed over the upper part of the screenshot at top ≈ y 470, subtle border 1px #e5e8eb and shadow 0 12px 32px rgba(25,31,40,0.12). Content: row with app icon 40px (radius 10px), "캠퍼스모아" 24px #4e5968, right side "지금" 24px #636c78; then title 30px weight 700 #191f28; then body 28px #4e5968 (single line, ellipsis). This mimics the real web push the site sends.
- All text must fit: no overflow, no clipping. Use `word-break: keep-all` for Korean.

## Data (put this array in compose-photos.mjs; template reads values from URL query or from an injected JSON)
1. file final/photo-1-home.png, shot raw/01-home.png, title "흩어진 학교 공고,<br><em>한곳에서</em>", sub "학교 공지·취업·대외활동을 모아 봐요"
2. final/photo-2-school.png, raw/02-school-filter.png, "<em>우리 학교</em> 공고만<br>골라 보기", "지역과 학교를 고르면 끝"
3. final/photo-3-tags.png, raw/03-tag-filter.png, "<em>관심 분야</em>로<br>좁혀 보기", "장학금, 공모전, 취업, 해외 프로그램까지"
4. final/photo-4-detail.png, raw/04-detail.png, "핵심만 <em>한눈에</em>", "모집 기간·대상 정리, 원문 링크로 바로 신청"
5. final/photo-5-calendar.png, raw/05-calendar.png, "마감 전날,<br><em>알려 드려요</em>", "관심 공고 일정은 캘린더에 모여요", notification { title: "내일 마감되는 관심 공고가 있어요", body: "2027년도 두산연강재단 장학생 선발 안내" }

## compose-photos.mjs
- Usage: `node scripts/compose-photos.mjs` run from design/promo. Import `chromium` from "playwright-core" via createRequire fallback: try import("playwright-core"); if that fails, read env PLAYWRIGHT_CORE (absolute path to the package dir) and import that (use pathToFileURL + "/index.mjs" or index.js).
- Chrome path from env CHROME_PATH (pass as executablePath).
- viewport 1080x1350, deviceScaleFactor 1. Load scripts/photo.html via file:// URL, inject slide data (e.g. page.evaluate(render, data) or query string), image paths as file:// absolute URLs, wait for images loaded and fonts ready, screenshot to the output path. Create final/ if missing.
- Optional CLI arg: slide numbers to render (e.g. `node scripts/compose-photos.mjs 5`).
- Keep code short and commented in Korean (one-line comments, beginner friendly).
