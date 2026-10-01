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
  - `localOnly` 출처(해외 서버에서 접속 불가)는 GitHub Actions에서 건너뛰고, 내 컴퓨터의 `scripts/collect-local.ps1`(작업 스케줄러)로 수집해 올린다
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
- 로그인(소셜 로그인)과 학교 설정
- 중복 제거: 같은 프로그램은 하나로 합치고 원문 링크는 모두 보관

## 수집 처리 순서 (`src/collect.ts`)

1. 출처별 수집기가 새 게시물을 가져온다 (robots.txt 확인, 요청 사이 1초 쉼)
2. `src/extract.ts`가 규칙으로 주최·기간·태그를 채운다
3. `useAi` 출처는 Codex CLI가 있으면 `src/ai.ts`가 게시물 8개씩 묶어 추출한다 (gpt-6.1-sol → 실패 시 gpt-6.0-astra)
   - AI로 이미 추출한 게시물은 다시 보내지 않는다. 교원·직원 대상 글은 빼고 `data/excluded.json`에 기억한다
   - AI 없이 수집한 결과(GitHub Actions)는 AI가 채운 주최·대상·태그를 덮어쓰지 않는다
4. `src/dedupe.ts`가 기존 데이터와 합치고 중복을 제거한다 (원문 링크는 모두 보관)
   - 제목 유사도 80% 이상은 규칙으로 합치고, 45~80%인 출처 간 쌍은 AI에게 같은 프로그램인지 묻는다
5. 마지막 일정이 90일 넘게 지난 항목은 지운다
6. `npm run collect -- --refresh`는 저장된 게시물도 다시 읽고 다시 추출한다 (추출 규칙을 바꿨을 때)

Codex CLI는 PATH에 없어도 `%LOCALAPPDATA%OpenAICodexin*codex.exe`에서 찾는다.
AI 추출 결과를 바꾸면 반드시 원문과 대조해 검수한다 (날짜 연도, 신청/제출 기한 구분, 태그 남발, 주최 유형).

## 폴더 구조

- `config/schools.json` — 학교와 출처 사이트 목록
- `config/tag-categories.json` — 태그 카테고리, 태그, 태그를 붙이는 키워드
- `src/types.ts` — 공통 데이터 형식
- `src/collectors/` — 사이트별 수집기 (`index.ts`에 등록)
- `data/programs.json` — 수집 결과, `data/collect-log.json` — 마지막 수집 기록
- `app/` — 화면. 하단 탭 바(`components/BottomNav.tsx`)로 홈 `/`, 공고 `/programs`, 캘린더 `/calendar`를 오간다. 상세는 `/programs/[id]`
  - 목록 필터는 주소(`?tag=...&q=...&closed=1&sort=recent`)에 저장된다
  - 상세·캘린더에서 `.ics` 캘린더 파일로 내보낼 수 있다 (`lib/ics.ts`)
- `components/` — 화면 부품, `lib/` — 필터 규칙·데이터 읽기·로그인 상태
- `supabase/schema.sql` — 로그인 사용자 데이터 표
- `.github/workflows/collect.yml` — 하루 1회 자동 수집
- `scripts/collect-local.ps1` — 내 컴퓨터에서 수집 후 GitHub에 올리기 (PowerShell 5.1 호환을 위해 BOM 포함 UTF-8로 저장)
- `docs/설정-안내.md` — 연결 상태와 남은 설정 방법

## 배포 정보

- 사이트: https://tagi-ten.vercel.app (main에 push하면 자동 배포)
- 저장소: https://github.com/hyunmiimnida/tagi
- Supabase 프로젝트 id: rytvncrksqcrxhsojmpj

## 명령어

- `npm run dev` — 내 컴퓨터에서 화면 실행 (http://localhost:3000)
- `npm run collect` — 수집 실행
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
