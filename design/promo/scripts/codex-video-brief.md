Codex에게 준 작업 지시 (영상 합치기)

You are working in design/promo (cwd). Write these files only:
- scripts/video-card.html — HTML template, 1080x1920 CSS px, used to render still PNG layers.
- scripts/compose-video.mjs — Node ESM script that renders the layers with Playwright, then calls ffmpeg to build the final video.

Do NOT run the script (no network / browser in your sandbox). You may run `node --check`.
Do not touch files outside design/promo. Comments in short Korean, beginner friendly. Keep the code short.

## Inputs (already exist)
- recording/raw-screen.mp4 — phone screen recording, 1170x2532, 30 fps, ~24.7 s, no audio.
- recording/scenes.json — `{ firstFrameEpoch, startEpoch, scenes: [{ name, t }] }`. `t` is seconds from startEpoch. Time in the video = t - (firstFrameEpoch - startEpoch) (clamp at 0). Scene names in order: list, school, tag, open, favorite, calendar, end.
- raw/app-icon-192.png — app icon.
- scripts/photo.html — the photo template; reuse the same look.
- env FFMPEG (full ffmpeg with libx264), CHROME_PATH (chrome.exe), optional PLAYWRIGHT_CORE (absolute package dir; same loader as scripts/compose-photos.mjs — copy its loadPlaywright function).

## Output
- final/demo-reel.mp4 — 1080x1920, 30 fps, H.264 (libx264, crf 20, preset slow, yuv420p, +faststart), no audio track. Total length = recording length + 3.0 s end card.
- Intermediate PNGs go to recording/layers/ (create it).

## Look (same as the photos: plain, like the app. No gradients, glow, sparkles, emoji, English slogans, device mockup, zoom/whip transitions, music)
- Background solid #f2f4f6. Font Pretendard Variable from
  https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css (fallback "Malgun Gothic"); wait for document.fonts.ready.
- Colors: text #191f28, secondary #4e5968, muted #636c78, line #e5e8eb, white, accent #1c68e3 only for the <em> word.
- Top row at y=80, side padding 88px: icon 44px (radius 11px) + "캠퍼스모아" 28px/700 left; "tagi-ten.vercel.app" 24px #636c78 right.
- Caption at y=190: 64px, weight 800, letter-spacing -0.02em, line-height 1.25, max 2 lines, keep-all; <em> = accent blue, not italic.
- Phone: the screen video scaled to 624x1350 (keeps 390:844 ratio), placed at x=228, y=440, with rounded corners radius 44px (mask the video corners — e.g. a white-frame PNG layer with a transparent rounded hole drawn on top, or alphamerge a mask) and a 12px white bezel around it with `0 0 0 1px #e5e8eb` outline and soft shadow `0 20px 48px rgba(25,31,40,0.10)` (bake bezel+shadow into the background layer PNG). Bottom of bezel ends at y=1802.
- Captions change per scene with a short 0.25 s crossfade only (no slide/zoom). Caption list (by scene name → caption HTML):
  - list + school (from 0 until "tag" starts): "<em>우리 학교</em>를 고르고"
  - tag: "<em>관심 분야</em>를 고르면"
  - open: "필요한 공고만<br><em>한눈에</em>"
  - favorite: "<em>관심 표시</em>하면"
  - calendar (until end of recording): "캘린더에<br><em>마감일</em>이 모여요"
- End card (last 3.0 s, 0.4 s crossfade from the last frame): same background and top row hidden; centered block: app icon 120px (radius 28px), "캠퍼스모아" 72px/800, then 40px gap, "흩어진 학교 공고, <em>한곳에서</em>" 44px/700, then "tagi-ten.vercel.app" 40px/700 #1c68e3, then "사이트에 들어가 홈 화면에 추가하세요" 32px/500 #4e5968. No app-store badges, no "다운로드".

## How (suggested)
1. Render with Playwright (viewport 1080x1920): one background PNG per caption (top row + caption + bezel/shadow, with the phone area left for the video), one frame/mask PNG for the rounded phone corners if you choose that approach, and the end-card PNG.
2. ffmpeg filter_complex: scale video to 624x1350; build the composite for each caption segment over its background; join segments with xfade 0.25 s (or overlay caption layers with fade alpha); then xfade 0.4 s to the looped end-card image (3.4 s so the final length is recording + 3.0 s). Keep it one ffmpeg call if practical. Print the ffmpeg command before running it.
3. At the end print the output path and duration (ffprobe is not available — compute from inputs).
