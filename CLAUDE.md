# 대학생 기회 정보 통합 서비스

여러 사이트에 흩어진 대학생 대상 프로그램 정보(학교 공지, 취업, 대외활동)를 한곳에 모아
태그로 쉽게 찾아보는 심플한 웹 서비스. 자세한 기획은 `대학생 기회 정보 통합 서비스 기획서.md` 참고.

## 사용자와 소통하는 방법

- 사용자는 코딩을 처음 해보는 초보자다. 설명은 항상 초보자 눈높이로 쉽게 한다.
- 모르는 용어가 나오면 짧게 풀어서 설명한다.
- 코드를 쓰기 전에 항상 계획부터 설명하고 확인을 받는다.
- 한 번에 기능 하나씩만 만들고, 사용자가 직접 실행해서 확인하는 방법을 알려준다.
- 기능 하나가 잘 동작하면 git 커밋한다.

## 기술 스택

- 언어: TypeScript (Node.js 24 이상, 수집기는 `.ts` 파일을 바로 실행)
- 웹: Next.js (App Router). 화면은 빌드할 때 `data/programs.json`을 읽어 미리 만든다
- 프로그램 데이터: `data/programs.json` 파일 (git에 저장)
- 로그인·학교 설정·관심 표시: Supabase (구글·카카오 소셜 로그인). 설정이 없으면 "체험 모드"로 브라우저에만 저장
- 하루 1회 자동 수집: GitHub Actions가 수집 후 `data/`를 커밋 → Vercel이 자동 재배포
  - `localOnly` 출처(해외 서버에서 접속 불가)는 GitHub Actions에서 건너뛰고, 내 컴퓨터의 `scripts/collect-local.ps1`(작업 스케줄러 "tagi 정보 수집", 매일 오후 1시·8시, 꺼져 있었으면 켤 때 실행)로 수집해 올린다
- 배포: Vercel
- HTML 분석: cheerio

## 설계 원칙 (반드시 지킬 것)

1. **학교는 설정값으로 관리한다.** 코드에 학교 이름이나 학교 사이트 주소를 직접 넣지 않는다. `config/schools.json`에만 적는다.
2. **수집은 "학교 → 여러 출처 사이트 → 사이트별 수집기" 구조로 분리한다.** 새 출처는 수집기 하나와 설정 한 줄만 추가한다. 한 출처가 실패해도 나머지는 계속 수집한다.
3. **모든 정보는 공통 데이터 형식(`src/types.ts`의 `Program`)으로 저장한다.**
4. **태그 카테고리도 데이터로 관리한다.** `config/tag-categories.json`에 두고, 코드 수정 없이 추가할 수 있게 한다.
5. **정보 수집은 하루 1회 자동 실행한다.**
6. **원문 전체를 복사하지 않는다.** 사실 정보만 요약 저장하고 원문 링크를 연결한다. robots.txt에서 자동 접근을 막은 사이트와 로그인이 필요한 페이지는 수집하지 않는다.

## 공통 데이터 형식

제목, 주최 기관, 주최 유형, 모집 대상(학교/단과대학/학과/학년), 모집 기간, 활동 기간,
태그, 원문 링크(여러 개 가능), 수집 출처. 주최와 출처는 별개로 기록한다.
알 수 없는 값은 추측해서 채우지 않고 `null` 또는 빈 목록으로 둔다.

## 핵심 기능

- 목록·상세: 같은 형식으로 보여주고 원문 링크로 연결
- 태그 필터링: 같은 카테고리 안은 "또는", 다른 카테고리끼리는 "그리고"
- 개인 캘린더: 관심 표시한 항목의 일정만 모아 보기
- 로그인(소셜 로그인)과 학교 설정. 학교는 공고 화면의 "학교" 필터에서 고르고, 고른 학교가 내 학교 설정으로 저장된다
- 학교 필터 안의 교내 기관 필터: `config/schools.json`의 `units` (산학협력단을 뺀 "~단" 기관). 주최 유형이 학교이고 주최 이름에 키워드가 있으면 그 기관
- 공고 출처가 속한 학교는 목록에 학교 배지(`shortName`, 예: 영남대)로 보인다 (`lib/data.ts`가 빌드할 때 계산)
- 중복 제거: 같은 프로그램은 하나로 합치고 원문 링크는 모두 보관. 합치기와 반복 프로그램 묶기는 같은 학교 출처끼리만 한다 (`src/school-of.ts`)
- 반복 프로그램: 해마다·학기마다 다시 열리는 프로그램을 `seriesId`로 묶어(`src/series.ts`) 상세 화면에 "지난 공고"와 후기 댓글(Supabase `comments` 표)을 보여 준다
- 모집 대상 학교: 기본은 게시한 학교. AI가 다른 학교 학생도 지원할 수 있다고 보면 `target.openTo`(예: "전국 대학생")를 쓰고 `target.schools`를 비운다. 학교 배지는 게시한 학교 기준이고, 학교 필터는 openTo 공고도 기본으로 함께 보여 준다("다른 학교도 지원" 배지, 필터 안 스위치로 끄면 주소에 `open=0`)
- 캘린더의 "지난 관심 공고": 보관함으로 간 관심 공고를 `public/api/ids.json`에서 찾아 제목·원문·이번 회차를 보여 준다 (`components/PastFavorites.tsx`)
- 댓글 도배 막기: `supabase/spam.sql` 트리거(20초 안 재작성, 하루 20개, 같은 내용 반복, 링크 2개 이상). 걸리면 `spam:이유` 오류 → `components/Comments.tsx`가 안내
- 마감 알림(웹 푸시): 프로필에서 켜면 `lib/push.ts`가 기기 알림 주소를 `push_subscriptions` 표에 저장. 매일 오전 9시 `.github/workflows/notify.yml`이 `scripts/notify.ts deadline`으로 내일 모집 마감인 관심 공고를 보낸다(`public/sw.js`가 받아 표시). 켜면 그 기기에 확인 알림을 바로 띄우고, 다른 기기에서 켠 알림이면 프로필에 "이 기기에서도 받기"가 보인다. 비밀 값 `SUPABASE_SERVICE_ROLE_KEY`·`VAPID_PRIVATE_KEY`는 GitHub Secrets에만
- 신고 알림: 같은 워크플로가 새 댓글 신고·정보 오류 신고를 "신고 확인 필요" GitHub 이슈로 올린다(저장소 주인에게 메일). 알린 신고는 `alerted_at`에 표시
- 운영 연락처: `lib/policy.ts`의 `CONTACT_EMAIL` (개인정보 보호 책임자·문의·권리 침해 신고). 수집기 이름(`src/fetch.ts`의 USER_AGENT)에도 같은 이메일을 적는다
- 합쳐진 공고는 `aliases`에 예전 id를 남기고, 없는 공고 주소는 `app/not-found.tsx`가 `public/api/ids.json`으로 새 주소나 보관 안내를 찾아 준다

## 수집 처리 순서 (`src/collect.ts`)

1. 출처별 수집기가 새 게시물을 가져온다. 서로 다른 사이트는 동시에 읽고, 같은 사이트는 요청 사이 1초 쉰다
   - robots.txt는 사이트마다 한 번 받아 기억하고, 목록·상세 등 **읽는 모든 주소**를 `fetchHtml`이 확인한다. 막힌 글은 건너뛰고 `collect-log.json`의 `robotsBlocked`에 남긴다
2. `src/extract.ts`가 규칙으로 주최·기간·태그를 채운다
3. `useAi` 출처는 AI CLI가 있으면 `src/ai.ts`가 게시물 15개씩 묶어 추출한다 (실패하면 규칙 결과를 그대로 쓴다)
   - 엔진: 기본은 **Claude** (Claude 앱에 들어 있는 Claude Code CLI, `%APPDATA%\Claude\claude-code\*\claude.exe`, 모델 `CLAUDE_MODEL`=sonnet). 도구 없이(포스터만 Read) 빈 임시 폴더에서 실행한다. `AI_ENGINE=codex`로 실행하면 Codex CLI(gpt-6.1-sol)
   - 본문 글자가 거의 없고 그림만 있는 글은 그림(최대 2장)을 받아 AI가 포스터 글자를 읽고 본문 뒤에 붙인다 (`needsPoster`). 그림 주소도 robots.txt를 따른다(영남대 `/_attach`, 계명대 본부 `/upload`는 막혀 있어 못 읽음). 읽은 글자는 저장하지 않는다. 규칙으로 날짜를 하나도 못 찾은 글만, 한 번 실행에 10개까지(`POSTER_LIMIT`)
   - AI는 상세 화면 맨 위 한 줄 요약(`summary`, 원문을 베끼지 않고 자기 말로 60자 안)도 쓴다
   - AI는 사전 신청 없이 기간 중에 참여·이용하는 행사·서비스(박람회, 상설 상담실 등)인지(`noApplication`)도 판단한다. 모집 기간이 없고 이 값이 true면 목록에 "신청 없이 참여"와 기간, 상세에 "신청 없이 참여할 수 있어요"·"운영 기간"을 보여 준다
   - 학교(산학협력단·사업단·센터 등)가 자기 직원·교원을 뽑는 공고는 제목 규칙(`isStaffHiring`)으로 AI에 보내기 전에 뺀다. 바깥 기관의 신입 채용·채용 설명회는 남긴다
   - AI로 이미 추출한 게시물은 다시 보내지 않는다. 교원·직원 대상 글은 빼고 `data/excluded.json`에 기억한다
   - AI 없이 수집한 결과(GitHub Actions)는 AI가 채운 주최·대상·태그를 덮어쓰지 않는다
4. `src/dedupe.ts`가 기존 데이터와 합치고 중복을 제거한다 (원문 링크는 모두 보관)
   - 제목 유사도 80% 이상은 규칙으로 합치고, 45~80%인 출처 간 쌍은 AI에게 같은 프로그램인지 묻는다 (답은 `data/duplicate-decisions.json`에 기억)
   - 같은 게시판의 재게시는 "재게시·기간연장" 표시, "재안내"(→안내), 앞의 `[홍보]` 머리말과 제목 앞 마감·대상 머리말(`[(재게시) 8/17(월) 까지_…]`)을 지우고 같은 공고로 합친다. 합쳐진 글의 id는 `aliases`에 남고, 관심 표시는 `public/api/moved.json`으로 새 id에 옮겨진다
5. 마지막 일정이 90일 넘게 지난 항목은 지우지 않고 `data/archive.json`(보관함)으로 옮긴다
6. `src/series.ts`가 목록과 보관함을 함께 보고 반복 프로그램을 묶는다
   - 회차·연도·학기를 지운 "기본 제목"이 같거나 매우 비슷하면 묶고, 애매한 쌍은 AI에게 묻는다 (답은 `data/series-decisions.json`에 기억)
   - 비슷한 때(60일 안)에 열리는 비슷한 이름은 다른 프로그램으로 본다
   - 기본 제목에서 앞쪽 `[부서 이름]` 머리말은 지운다. 같은 틀에 맨 앞 이름(회사·지역)만 다르면 다른 프로그램 (`swappedName`)
   - 사슬 막기: 가장 비슷한 쌍부터 잇고, 묶음끼리 이을 때 서로 다른 외부 주최 기관이거나 "이름만 바뀐" 제목이 섞이면 잇지 않는다. AI·사람이 같다고 판단한 쌍은 그대로 잇는다
   - 기간 검사: 마감일이 게시일보다 60일 넘게 앞서면 연도 넘김을 고치거나(1년 더함) 모르는 값으로 둔다 (`plausiblePeriod`)
7. `npm run collect -- --refresh`는 저장된 게시물도 다시 읽고 다시 추출한다 (추출 규칙을 바꿨을 때)

과거 글 쌓기 (`src/backfill.ts`, 내 컴퓨터에서만): `npm run backfill -- --since 2020-01-01`로 목록 훑기 → 제목으로 1차 거르기(AI) → 본문 읽고 추출(AI),
끝나면 `npm run backfill -- --save`로 목록·보관함에 합친다. 진행 상황은 `.cache/backfill/`에 있어 끊겨도 이어서 한다
- AI 한도가 없으면 `--rules`를 붙여 AI 없이 규칙으로만 추출한다 (보관함에만 들어갈 오래된 글은 이것으로 충분하다)
- 반복 프로그램인지 애매한 쌍을 AI가 판단하지 못하면, 지금 목록 공고와 관련된 쌍만 뽑아 직접 판단해 `data/series-decisions.json`에 `"id1|id2": true/false`로 적는다 (id는 사전순 정렬). 다음 저장 때 반영된다

Claude CLI·Codex CLI는 PATH에 없어도 각 앱이 설치한 곳(Claude `%APPDATA%\Claude\claude-code\*\claude.exe`, Codex `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`)에서 최신 버전을 찾는다.
AI 추출 결과를 바꾸면 반드시 원문과 대조해 검수한다 (날짜 연도, 신청/제출 기한 구분, 태그 남발, 주최 유형).

## 폴더 구조

- `config/schools.json` — 학교와 출처 사이트 목록
- `config/tag-categories.json` — 태그 카테고리, 태그, 태그를 붙이는 키워드
- `src/types.ts` — 공통 데이터 형식
- `src/collectors/` — 사이트별 수집기 (`index.ts`에 등록)
  - `news-board`(영남대 영대소식), `career-program-list`(영남대 취업정보), `table-board`(번호·제목·작성자·등록일 표 모양 게시판. 경북대·계명대처럼 선택자·주소 규칙을 출처의 `board` 설정에 적으면 새 학교도 코드 없이 추가)
  - 지금 학교: 영남대(취업정보, 그리고 내 컴퓨터에서만 수집하는 영대소식·RISE사업단·단과대 14곳), 경북대(공지사항·행사·창업지원단), 계명대(공지사항·모집·장학·창업지원단·단과대 10곳), 대구가톨릭대(공지사항·진로취업·장학·봉사)
  - 수집하지 않는 곳: 경북대 KNU CUBE·진로취업과·단과대(home.knu.ac.kr의 /HOME 경로를 robots.txt가 막음)·AI대학(AI 크롤러 차단), 계명대 STORY+·취업센터·간호대·의대(접근 거부), 영남대 창업지원단 사이트(글이 거의 없음, 영대소식·RISE사업단에 같은 글이 올라옴)
  - 수집하지 않는 학교: 대구대(게시판 /article/ 경로를 robots.txt가 막음)
  - 대구가톨릭대 게시판은 쪽·글 번호를 base64로 감싼 `mv_data` 칸을 쓴다 → table-board의 `encoded` 설정 (주소 인코딩 없이, 끝 `=` 빼고 넣는다)
  - 계명대 단과대·창업지원단은 K2Web 게시판(`/bbs/{사이트}/{게시판번호}/artclList.do`)이라 table-board의 `idPattern`으로 번호를 찾는다
- `data/programs.json` — 수집 결과(최근 90일), `data/archive.json` — 지난 공고 보관함, `data/collect-log.json` — 마지막 수집 기록 (출처마다 `lastSuccessAt`·`lastSuccessCount`를 이전 기록에서 이어받는다)
- 결과 올리기: GitHub Actions와 내 컴퓨터 수집이 겹쳐 push가 실패하면, 최신을 받아 다시 수집하고 올린다(최대 3번). Actions는 한 번에 하나만 실행
- 검색엔진: `app/sitemap.ts`(홈·목록·상세 전체), `app/robots.ts`
- 공유 미리보기 이미지: `app/opengraph-image.tsx`(사이트), `app/programs/[id]/opengraph-image.tsx`(공고마다), 그리는 부품 `lib/og.tsx`. 빌드할 때 Pretendard otf를 CDN에서 한 번 받아 쓴다(woff는 그림 만들 때 오류)
- 그림: 분야 아이콘 `components/FieldIcon.tsx`, 빈 화면 그림 `components/EmptyArt.tsx`. 원문 포스터는 쓰지 않는다(원문 복사·robots.txt의 첨부 경로 차단)
- `app/` — 화면. 하단 탭 바(`components/BottomNav.tsx`)로 홈 `/`, 공고 `/programs`, 캘린더 `/calendar`, 프로필 `/my`를 오간다. 상세는 `/programs/[id]`
  - 목록 필터는 주소(`?school=yu&unit=...&tag=...&q=...&closed=1&sort=recent`)에 저장된다
  - 상세·캘린더에서 `.ics` 캘린더 파일로 내보낼 수 있다 (`lib/ics.ts`, 마감 일정에는 하루 전 오전 9시 알림)
  - 검색(`matchesKeyword`)은 제목·주최·한 줄 요약·태그에서 찾고, 띄어 쓴 단어는 모두 들어 있어야 한다(띄어쓰기 무시)
- `components/` — 화면 부품, `lib/` — 필터 규칙·데이터 읽기·로그인 상태
- `supabase/schema.sql` — 로그인 사용자 데이터 표(학교 설정, 관심 표시, 후기 댓글)
- `supabase/moderation.sql` — 회원 탈퇴, 댓글 신고(`reports`)·숨기기(`blocks`), 이용 규칙 동의. 댓글은 `comment_feed` 뷰로만 읽는다(글쓴이 id 비공개)
- `/my`(프로필: 닉네임, 학교·신분·학년, 관심 분야, 알림 설정 자리, 내 댓글, 탈퇴. 설정은 `lib/user.tsx`의 `profile`, 로그인하면 `profiles` 표에도 저장, `supabase/profile.sql`). 신분·학년은 공고 목록 대상 필터의 기본값, 관심 분야는 홈 "내 관심 분야 공고"에 쓴다
- 약관: `/terms`(이용약관), `/privacy`(개인정보처리방침). 문의처·규칙 문구는 `lib/policy.ts`
- PWA: `app/manifest.ts`, `public/sw.js`(오프라인 때 마지막 화면), 아이콘 `public/icon-*.png`, `app/apple-icon.png`
- `mobile/` — 앱(Expo) 뼈대. **비용 문제로 잠시 멈춤** (스토어 개발자 등록비가 든다). 지금은 PWA(홈 화면에 추가)와 웹 푸시로 앱 역할을 대신한다. 앱 아이콘 시안은 `design/app-icon/` 사이트를 바꿀 때 앱 전환에 걸림돌이 생기지 않게 한다 (데이터는 `public/api`로 계속 제공)
- `.github/workflows/collect.yml` — 하루 1회 자동 수집
- `scripts/collect-local.ps1` — 내 컴퓨터에서 수집 후 GitHub에 올리기 (PowerShell 5.1 호환을 위해 BOM 포함 UTF-8로 저장)
- `docs/설정-안내.md` — 연결 상태와 남은 설정 방법

## 배포 정보

- 사이트: https://tagi-ten.vercel.app (main에 push하면 자동 배포)
- 저장소: https://github.com/hyunmiimnida/tagi
- Supabase 프로젝트 id: rytvncrksqcrxhsojmpj

## 명령어

- `npm run dev` — 내 컴퓨터에서 화면 실행 (http://localhost:3000)
- `npm run collect` — 수집 실행, `npm run backfill` — 과거 글 쌓기 (위 설명 참고)
- `npm run recheck` — 목록 공고 중 나중에 생긴 AI 칸(다른 학교 학생도 지원 가능한지 `openTo`, 한 줄 요약 `summary`)·모집 기간이 없는 글의 신청 없이 참여 여부 `noApplication`)을 확인하지 않은 글만 다시 읽어 AI에게 묻는다
- `node scripts/audit-quality.ts` — 품질 점검: 중복 줄, 잡음(신청할 것 없는 글) 비율, 마감일 대조 샘플(원문의 날짜 줄을 사람이 보고 대조) → `logs/quality-audit.json`. 출시 기준: 마감일 정확도 90%↑, 잡음 5%↓, 중복 0
- `node scripts/review-excluded.ts` — "학생 대상 아님"으로 뺀 글을 다시 읽어 AI에게 다시 판단받기 (`--apply`로 되살리기. 되살리기 전에 사람이 목록 확인)
- `node scripts/save-fixtures.ts` — 수집기 테스트용 HTML 샘플 만들기·갱신 (`test/fixtures/`, 학교 사이트 구조가 바뀌었을 때). 원문 글이 들어 있어 GitHub에 올리지 않는다(.gitignore). 샘플이 없으면 그 테스트는 건너뛴다
- `node scripts/assign-series.ts` — 수집 없이 반복 프로그램 묶음만 다시 계산 (애매한 쌍은 AI에게 묻는다)
- `node scripts/check-health.ts` — 수집 점검 (3번 연속 실패·3일 넘게 성공 없음). GitHub Actions가 문제를 "수집 점검 필요" 이슈로 올린다
- `npm test` — 자동 검사, `npm run typecheck` — 코드 오류 검사, `npm run build` — 배포용 빌드

## 디자인 규칙

- 토스·노션처럼 단순하게: 회색 바탕(`--bg`) 위 흰 카드(`--surface`), 큰 제목, 넉넉한 여백, 강조색은 파랑(`--accent`) 하나와 마감 빨강(`--warn`)
- 색은 `app/globals.css`의 변수만 쓴다 (다크 모드가 자동으로 맞춰진다)
- 공고 한 줄은 `components/ProgramRow.tsx`, 아이콘은 `components/Icons.tsx`를 재사용한다
- 화면 전체를 덮는 창(로그인 시트 등)은 머리말 안에 두지 않는다 (반투명 효과 때문에 위치가 깨진다)

## 코드 규칙

- import 경로에는 확장자(`.ts`, `.tsx`)를 붙인다 (수집기를 Node.js로 바로 실행하기 때문)

## Codex CLI 활용 규칙

- 토큰이 많이 드는 작업(많은 게시물 한꺼번에 분석, 긴 파일 전체 검토 등)과
  이미지 관련 작업(포스터 글자 추출, 이미지 생성 등)은 `codex exec`에 맡긴다.
- 맡기기 전에 설치 여부를 확인하고(`codex --version`), 없으면 설치 방법을 알려준다
  (`npm install -g @openai/codex`).
- 어떤 작업을 Codex에 맡기는지 매번 한 줄로 알려준다.
- Codex 토큰은 적정히 쓴다 (2026-10-02 사용자 결정). 수집기의 AI 추출은 Claude로 옮겼고, 큰 일괄 작업(수천 개 다시 읽기 등)은 꼭 필요할 때만 한다.
