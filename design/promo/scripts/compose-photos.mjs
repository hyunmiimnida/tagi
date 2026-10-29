import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const slides = [
  { file: 'final/photo-1-home.png', shot: 'raw/01-home.png', title: '흩어진 학교 공고,<br><em>한곳에서</em>', sub: '학교 공지·취업·대외활동을 모아 봐요' },
  { file: 'final/photo-2-school.png', shot: 'raw/02-school-filter.png', title: '<em>우리 학교</em> 공고만<br>골라 보기', sub: '지역과 학교를 고르면 끝', offset: 120 },
  { file: 'final/photo-3-tags.png', shot: 'raw/03-tag-filter.png', title: '<em>관심 분야</em>로<br>좁혀 보기', sub: '장학금, 공모전, 취업, 해외 프로그램까지' },
  { file: 'final/photo-4-detail.png', shot: 'raw/04-detail.png', title: '공고 핵심만<br><em>한눈에</em>', sub: '모집 기간·대상 정리, 원문 링크로 바로 신청' },
  { file: 'final/photo-5-calendar.png', shot: 'raw/05-calendar.png', title: '마감 전날,<br><em>알려 드려요</em>', sub: '관심 공고 일정은 캘린더에 모여요', notification: { title: '내일 마감되는 관심 공고가 있어요', body: '2027년도 두산연강재단 장학생 선발 안내' } },
];

// 기본 패키지를 먼저 찾고, 없으면 환경 변수의 패키지 폴더를 사용해요.
async function loadPlaywright() {
  try {
    return await import('playwright-core');
  } catch (error) {
    const directory = process.env.PLAYWRIGHT_CORE;
    if (!directory || !path.isAbsolute(directory)) {
      throw new Error('playwright-core를 설치하거나 PLAYWRIGHT_CORE에 패키지 폴더의 절대 경로를 지정하세요.', { cause: error });
    }
    try {
      return await import(pathToFileURL(path.join(directory, 'index.mjs')).href);
    } catch {
      return require(path.join(directory, 'index.js'));
    }
  }
}

// 번호를 생략하면 다섯 장을 모두 만들어요.
function selectSlides(args) {
  if (!args.length) return slides;
  if (args.some((arg) => !/^[1-5]$/.test(arg))) {
    throw new Error('슬라이드 번호는 1~5로 입력하세요. 예: node scripts/compose-photos.mjs 2 5');
  }
  return [...new Set(args)].map((number) => slides[Number(number) - 1]);
}

const fileUrl = (file) => pathToFileURL(path.resolve(file)).href;

async function main() {
  const selected = selectSlides(process.argv.slice(2));
  const executablePath = process.env.CHROME_PATH;
  if (!executablePath) throw new Error('CHROME_PATH에 Chrome 실행 파일 경로를 지정하세요.');
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    await mkdir(path.resolve('final'), { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    await page.goto(fileUrl('scripts/photo.html'), { waitUntil: 'load' });
    for (const slide of selected) {
      // 로컬 사진 경로를 브라우저가 읽을 수 있는 주소로 바꿔요.
      await page.evaluate((data) => window.renderSlide(data), {
        ...slide, shot: fileUrl(slide.shot), icon: fileUrl('raw/app-icon-192.png'),
      });
      await page.screenshot({ path: path.resolve(slide.file), type: 'png', fullPage: false });
      console.log(`저장: ${slide.file}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
