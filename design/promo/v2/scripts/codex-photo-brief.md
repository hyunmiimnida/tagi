You are working in the folder design/promo/v2 (cwd). Write exactly two files:
- scripts/photo.html — one HTML template for an Instagram feed image, exactly 1080x1350 CSS px
- scripts/compose-photos.mjs — Node ESM script that renders 6 PNGs into final/ with Playwright

Do NOT edit any file outside design/promo/v2. Do not run a browser or network (I will run it).

## Why (the previous version looked cheap)
The old version pasted a whole phone screenshot inside a fake phone frame, cut off at the bottom, under a header that took a third of the image. Text inside the screenshot was small and the important part was not shown. Fix: show ONLY the important part of the screen, BIG, as a clean rounded card. One message per image.

## Look — plain, like the app itself (Toss / Notion style). No "AI look"
- Background solid #f2f4f6. No gradients, glow, sparkles, 3D, emoji, English slogans, device frames, decorative shapes.
- Font: Pretendard Variable:
  https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css
  fallback "Malgun Gothic", sans-serif. Wait for document.fonts.ready AND all images decoded before screenshot.
- Colors only: text #191f28, secondary #4e5968, muted #8b95a1, line #e5e8eb, white #fff, accent blue #1c68e3 (only for the <em> words in titles and the URL on the last slide).
- `word-break: keep-all` everywhere. Nothing may overflow or be clipped (assert in script: if any text element's scrollWidth > clientWidth or it extends outside the canvas, print a warning with the slide number).

## Layout (slides 1–5)
- Side padding 80px, left aligned.
- Brand row at top: y=72, app icon `../raw/app-icon-192.png` (path relative to v2: `../raw/app-icon-192.png` is design/promo/raw/app-icon-192.png) 40px radius 10px + "캠퍼스모아" 26px weight 700 #191f28, gap 12px. Nothing on the right.
- Title: top y=156, 76px, weight 800, letter-spacing -0.03em, line-height 1.22, #191f28, max 2 lines. <em> = accent blue, not italic.
- Subtitle: 20px below title, 34px, weight 500, #4e5968, one line.
- Screen card: horizontally centered, width 920px, top = subtitle bottom + 64px, and it must END at least 72px above the bottom edge (do not run off the canvas). It is a white-ish crop of a real screenshot: border-radius 36px, overflow hidden, border 1px #e5e8eb, box-shadow 0 16px 40px rgba(25,31,40,0.08).
  - The crop is given in the screenshot's CSS px (screenshots are 390 CSS px wide at 3x = 1170 image px). Crop rect {x, y, w, h} in CSS px → image px = ×3. Scale so the crop width fills 920px (scale = 920 / w CSS). Card height = h × scale. If the card would be taller than the room available, reduce h from the bottom (keep top) and print a note.
  - Implement with a div (overflow hidden) containing the full <img> absolutely positioned and scaled: img width = 1170/3 × scale px, left = -x × scale, top = -y × scale. Use `image-rendering: auto`.
- Optional overlay (slide 5 only): a web-push style notification card: white, radius 28px, width 860px, centered, top = card top − 40px (it overlaps the top edge of the screen card), border 1px #e5e8eb, shadow 0 16px 40px rgba(25,31,40,0.14), padding 28px 32px. Row: icon 40px radius 10px + "캠퍼스모아" 24px #4e5968, right "지금" 24px #8b95a1. Then title 32px weight 700 #191f28 (margin-top 14px), then body 28px #4e5968 single line with ellipsis. When an overlay is present, push the screen card down by 70px so the overlay does not cover the calendar header.

## Slide 6 (last, call to action) — no screenshot
- Same brand row and title/subtitle styles.
- Below: one large white card (radius 36px, same border/shadow, width 920px, padding 56px):
  - "tagi-ten.vercel.app" 60px weight 800 accent blue, letter-spacing -0.02em
  - 28px gap, thin line #e5e8eb, 28px gap
  - 3 numbered steps, each a row: number in a 52px circle (#f2f4f6 bg, #191f28, 26px weight 700) + text 34px weight 600 #191f28, 36px between rows.
- Bottom: "프로필 링크에서 바로 열 수 있어요" 28px #8b95a1, 72px above the bottom edge, left aligned.

## Data (put in compose-photos.mjs). Screenshot paths are relative to v2.
1. final/photo-1-cover.png — raw/04-tag-list.png, crop {x:0,y:56,w:390,h:520}
   title "흩어진 학교 공고,<br><em>한곳에서</em>", sub "장학금·공모전·취업 공고를 모아 봐요"
2. final/photo-2-school.png — raw/01-school-panel.png, crop {x:0,y:120,w:390,h:450}
   title "<em>우리 학교</em> 공고만", sub "학교를 고르면 그 학교 공고만 남아요"
3. final/photo-3-tags.png — raw/03-tag-panel.png, crop {x:0,y:120,w:390,h:520}
   title "관심 분야로 <em>좁혀서</em>", sub "장학금, 공모전, 취업, 해외 프로그램"
4. final/photo-4-detail.png — raw/05-detail.png, crop {x:0,y:64,w:390,h:600}
   title "모집 기간·대상을<br><em>한눈에</em>", sub "신청은 원문 버튼으로 바로"
5. final/photo-5-alert.png — raw/07-calendar.png, crop CROP5 (I will fill in)
   title "마감 전날,<br><em>알려 드려요</em>", sub "관심 공고는 캘린더에 모여요"
   overlay { title: "내일 마감되는 관심 공고가 있어요", body: "2027년도 STX장학재단 장학생 선발 안내" }
6. final/photo-6-start.png — title "앱 설치 없이<br><em>홈 화면에 추가</em>", sub "휴대폰 브라우저에서 바로 써요"
   steps ["휴대폰 브라우저로 사이트 열기", "공유 버튼 → 홈 화면에 추가", "프로필에서 마감 알림 켜기"]

## compose-photos.mjs
- Run from design/promo/v2: `node scripts/compose-photos.mjs [slide numbers...]`
- playwright-core: `createRequire(process.env.PLAYWRIGHT_CORE + "/")("playwright-core")` (env PLAYWRIGHT_CORE = absolute package dir). Chrome from env CHROME_PATH.
- viewport 1080x1350, deviceScaleFactor 1. Load scripts/photo.html via file:// URL, pass slide data with page.evaluate(render, data), image src as file:// absolute URLs. Screenshot exactly 1080x1350 to the output path (mkdir final/).
- Short code, one-line Korean comments.
