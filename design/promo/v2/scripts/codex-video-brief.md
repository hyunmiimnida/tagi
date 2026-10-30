You are working in design/promo/v2 (cwd). Write exactly two files:
- scripts/video.html — a 1080x1920 CSS px stage that can draw ANY moment of the video: exposes `window.renderAt(t)` (t in seconds) that sets every element's position/opacity deterministically (no CSS transitions/animations, no timers — pure function of t).
- scripts/compose-video.mjs — Node ESM: opens video.html in Playwright (viewport 1080x1920, deviceScaleFactor 1), for each frame at 30 fps calls renderAt(frame/30), takes a PNG screenshot, and pipes the frames into ffmpeg (image2pipe) to write final/demo-reel.mp4.
Do NOT edit files outside design/promo/v2. Do not run a browser or ffmpeg yourself (I will).

## Why (the old video looked cheap)
The old reel put a small phone recording (60% of the width) in the middle of empty space, nothing happened in the first second, scenes dragged (7 s per step, 28 s total), the tap marker was faint, the ending was a tiny logo, and it was encoded at 0.3 Mbps so text smeared. Fix all of that.

## Look — plain like the app (Toss/Notion). No AI look
- Background #f2f4f6. Colors only: text #191f28, secondary #4e5968, muted #8b95a1, line #e5e8eb, white, accent #1c68e3. No gradients, glow, sparkles, emoji, English, device frames.
- Font Pretendard Variable https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css (fallback "Malgun Gothic"). Before rendering frames, wait for document.fonts.ready and all images decoded. `word-break: keep-all`.
- Easing: use easeOutCubic for movements, 0.25–0.35 s. Cross-fades between screen states 0.2 s.

## Inputs
- video-raw/states.json: { viewport {width:390,height:844,scale:3}, states: [{ name, file, tap: {x,y,width,height} | null }] }. Screenshots are 1170x2532 PNGs (390x844 CSS px at 3x) in video-raw/. tap = box (CSS px) of the element pressed to get to the NEXT state.
- App icon: ../raw/app-icon-192.png (design/promo/raw/app-icon-192.png).

## Screen card (used in scenes 2–5)
- Horizontally centered, width 900px, top y=420, shows a window of the screenshot: CSS-px window {x:0, y:0, w:390, h:600} (scale = 900/390), so the card is 1385px tall (ends at 1805). Card: radius 44px, overflow hidden, border 1px #e5e8eb, box-shadow 0 20px 48px rgba(25,31,40,0.10).
- The card holds image layers (all states of the current scene stacked, opacity animated) so state changes are cross-fades inside the same card.
- Tap marker: when a state has `tap`, 0.45 s before switching to the next state draw a circle at the tap box center (convert CSS px → card px with the scale): accent #1c68e3 at 22% opacity fill + 4px solid accent ring at 70% opacity, diameter grows 40→96px with easeOutCubic and fades out over the last 0.15 s. It must be clearly visible.
- Between scenes the card slides: outgoing card moves up 60px and fades out (0.3 s), incoming moves from +60px to 0 and fades in (0.3 s).

## Caption (scenes 2–5)
- Top area: left 80px, top 150px. Line 1: step label like "1" in a 64px accent circle (white 34px weight 800 number) + caption text 66px weight 800 #191f28 letter-spacing -0.03em on the same line, vertically centered. Caption changes with a 0.25 s fade/slide-up per scene. Must stay one line within 920px.

## Timeline (total 20.0 s)
1. 0.00–2.40 HOOK (no screenshot). Visible from frame 0 (first frame must already show the main text — no fade-in from blank):
   - Text block left 80px, top 560: "장학금 공고 찾느라" / "사이트 몇 개 여세요?" — 92px weight 800 #191f28, line-height 1.25; the second line's "몇 개" in accent.
   - Below (60px gap) four pill labels appear one by one every 0.3 s starting at 0.3 s (fade + 20px rise): "학교 공지", "취업센터", "창업지원단", "학과 게시판". Pills: white bg, 1px #e5e8eb border, radius 999px, 40px text weight 600 #4e5968, padding 18px 32px, wrap with 16px gaps.
   - 1.90–2.40: the whole block fades out and moves up 40px.
2. 2.40–6.60 caption "1  우리 학교를 고르고" — states v01-list-all (until 3.5), v02-school-panel (until 5.0), v03-school-list (until 6.6). Taps shown from their `tap` boxes before each switch.
   IMPORTANT: for v02 the pressed chip is near y≈554–590 CSS px; it is inside the 0–600 window. Keep window y 0.
3. 6.60–11.20 caption "2  관심 분야를 고르면" — v03-school-list (until 7.6, tap on 분야 chip), v04-tag-panel (until 9.0, tap), v05-tag-picked (until 9.9), v06-tag-list (until 11.2).
4. 11.20–14.80 caption "3  핵심만 보고 관심 표시" — v07-detail (until 12.8, tap on star), v08-detail-starred (until 14.8). During v08, gently zoom the card image 1.00→1.04 around the star button (subtle).
5. 14.80–17.60 caption "4  마감 전날엔 알림까지" — v09-calendar for the whole scene. At 15.4 a notification card drops in from above to overlap the top of the screen card: white, radius 32px, width 940px, centered, final top y=380 (starts at y=300, opacity 0, 0.35 s easeOutCubic), border 1px #e5e8eb, shadow 0 20px 48px rgba(25,31,40,0.16), padding 32px 36px. Row: icon 44px radius 11px + "캠퍼스모아" 28px #4e5968, right "지금" 28px #8b95a1; title "내일 마감되는 관심 공고가 있어요" 36px weight 700 #191f28 (margin-top 16px); body "2027년도 STX장학재단 장학생 선발 안내" 32px #4e5968, one line with ellipsis. The caption stays visible (notification is below the caption area; the caption bottom must be above y=360 — check).
6. 17.60–20.00 END (screen card and caption slide/fade out by 17.9). Centered column, vertically centered around y≈880:
   app icon 168px radius 38px; 36px gap; "캠퍼스모아" 72px weight 800 #191f28; 20px gap; "흩어진 학교 공고, 한곳에서" 40px weight 600 #4e5968; 64px gap; a white rounded card (radius 36px, border, shadow as above, padding 36px 56px) containing "tagi-ten.vercel.app" 60px weight 800 accent; 32px gap; "앱 설치 없이 홈 화면에 추가" 36px weight 600 #8b95a1. Elements fade+rise in staggered by 0.12 s from 17.70. Hold still for the last 1.2 s.

## compose-video.mjs
- Run from design/promo/v2: `node scripts/compose-video.mjs`. playwright-core via `createRequire(process.env.PLAYWRIGHT_CORE + "/")("playwright-core")`, Chrome from env CHROME_PATH, ffmpeg from env FFMPEG.
- Load video.html via file:// URL, pass states.json and absolute file:// image URLs via page.evaluate(setup, data) before rendering.
- For each frame: `await page.evaluate(t => renderAt(t), t)` then `page.screenshot({ type: "png" })` and write to ffmpeg stdin. Handle backpressure (await drain).
- ffmpeg args: -y -f image2pipe -framerate 30 -c:v png -i - -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -profile:v high -movflags +faststart final/demo-reel.mp4
- Also save poster frames for checking: final/frames-check/t{sec}.png at t = 0, 1.2, 3.3, 4.6, 5.6, 8.6, 10.5, 12.5, 13.8, 16.0, 19.0 (just copy those frame PNGs).
- Print progress every 60 frames. Short code, one-line Korean comments.
