# 홍보물 (인스타그램 사진·영상)

| 폴더/파일 | 내용 |
|---|---|
| `final/photo-1~5-*.png` | 피드용 사진 5장 (1080×1350) |
| `final/demo-reel.mp4` | 릴스·스토리용 시연 영상 (1080×1920, 약 28초, 소리 없음) |
| `captions.md` | 인스타 글 문구 초안 3개 |
| `raw/` | 휴대폰 크기(390×844, 3배) 원본 캡처 |
| `recording/raw-screen.mp4`, `scenes.json` | 원본 화면 녹화와 장면 시각 (`frames/`는 git에 안 올림) |
| `scripts/` | 캡처·녹화(Claude 작성), 사진·영상 합치기(Codex 작성, `codex-*-brief.md`가 맡긴 내용) |

## 다시 만드는 방법

1. 로그인 설정이 없는 "체험 모드" 사이트를 띄운다: 저장소를 다른 폴더에 복사(`git archive HEAD`)하고 `.env.local` 없이 `npm ci` → `npm run build` → `npx next start -p 3210`
2. 도구: `playwright-core`, `ffmpeg-static`(정식 ffmpeg, Playwright에 딸린 ffmpeg는 mp4를 못 만든다)을 설치한 폴더에서 스크립트를 실행한다. 환경 변수 `CHROME_PATH`(Playwright 크롬), `PLAYWRIGHT_CORE`(패키지 폴더), `FFMPEG`
3. 캡처 `node capture.mjs http://localhost:3210 <promo>/raw` → 사진 `node scripts/compose-photos.mjs` (promo 폴더에서)
4. 녹화 `node record.mjs http://localhost:3210 <promo>/recording` → `ffmpeg -f concat -safe 0 -i frames.txt -vf "fps=30,format=yuv420p" -c:v libx264 -crf 18 raw-screen.mp4` (recording 폴더에서) → 영상 `node scripts/compose-video.mjs`

화면 속 날짜는 고정했다: 사진은 2026-10-29(마지막 수집일), 영상은 2026-11-12(두산연강재단 장학생 마감 하루 전 → "내일 마감" 알림과 맞춤). `PROMO_NOW`로 바꿀 수 있다.
체험 모드 표시(`.trial-label`)는 캡처에서만 숨겼다. 이메일·닉네임·댓글은 나오지 않는다. 원문 포스터 그림은 쓰지 않았다.
