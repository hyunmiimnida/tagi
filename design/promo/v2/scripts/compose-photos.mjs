import { access, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// 5번은 스크린샷 CSS px 기준 { x, y, w, h }를 입력하세요.
const CROP5 = { x: 0, y: 128, w: 390, h: 290 }; // 캘린더 카드
const slides = [
  {
    output: 'final/photo-1-cover.png', image: 'raw/04-tag-list.png',
    crop: { x: 0, y: 118, w: 390, h: 286 }, width: 920,
    title: '흩어진 학교 공고,<br><em>한곳에서</em>', sub: '장학금·공모전·취업 공고를 모아 봐요',
  },
  {
    output: 'final/photo-2-school.png', image: 'raw/01-school-panel.png',
    crop: { x: 0, y: 178, w: 390, h: 372 }, width: 840,
    title: '<em>우리 학교</em> 공고만', sub: '학교를 고르면 그 학교 공고만 남아요',
  },
  {
    output: 'final/photo-3-tags.png', image: 'raw/03-tag-panel.png',
    crop: { x: 0, y: 118, w: 390, h: 296 }, width: 920,
    title: '관심 분야로 <em>좁혀서</em>', sub: '장학금, 공모전, 취업, 해외 프로그램',
  },
  {
    output: 'final/photo-4-detail.png', image: 'raw/05-detail.png',
    crop: { x: 0, y: 108, w: 390, h: 358 }, width: 860,
    title: '모집 기간·대상을<br><em>한눈에</em>', sub: '신청은 원문 버튼으로 바로',
  },
  {
    output: 'final/photo-5-alert.png', image: 'raw/07-calendar.png', crop: CROP5, width: 920,
    title: '마감 전날,<br><em>알려 드려요</em>', sub: '관심 공고는 캘린더에 모여요',
    overlay: { title: '내일 마감되는 관심 공고가 있어요', body: '2027년도 STX장학재단 장학생 선발 안내' },
  },
  {
    output: 'final/photo-6-start.png',
    title: '앱 설치 없이<br><em>홈 화면에 추가</em>', sub: '휴대폰 브라우저에서 바로 써요',
    steps: ['휴대폰 브라우저로 사이트 열기', '공유 버튼 → 홈 화면에 추가', '프로필에서 마감 알림 켜기'],
  },
];

function selectSlides(args) {
  const numbers = args.length ? args.map(Number) : [1, 2, 3, 4, 5, 6];
  if (numbers.some(n => !Number.isInteger(n) || n < 1 || n > 6)) {
    throw new Error('슬라이드 번호는 1~6입니다: node scripts/compose-photos.mjs [번호...]');
  }
  return [...new Set(numbers)].map(number => ({ ...slides[number - 1], number }));
}

function validateCrop(slide) {
  const width = slide.width ?? 920;
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`[${slide.number}번] width는 양수인 CSS px 값이어야 합니다.`);
  }
  if (!slide.image) return;
  const c = slide.crop;
  if (!c || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(c[key])) ||
      c.x < 0 || c.y < 0 || c.w <= 0 || c.h <= 0) {
    throw new Error(`[${slide.number}번] 유효한 crop이 필요합니다. 5번은 CROP5에 { x, y, w, h }를 입력하세요.`);
  }
}

// 브라우저 안에서 데이터와 실제 글꼴 크기로 배치합니다.
async function render(data) {
  const get = id => document.getElementById(id);
  get('title').innerHTML = data.title;
  get('subtitle').textContent = data.sub;
  get('brand-icon').src = data.icon;
  get('screen').hidden = !data.image;
  get('notification').hidden = !data.overlay;
  get('start-card').hidden = !data.steps;
  get('footer').hidden = !data.steps;
  if (data.image) get('screen-image').src = data.image;
  if (data.steps) get('start-icon').src = data.icon;
  if (data.overlay) {
    get('notification-icon').src = data.icon;
    get('notification-title').textContent = data.overlay.title;
    get('notification-body').textContent = data.overlay.body;
  }
  get('steps').replaceChildren(...(data.steps ?? []).map((text, i) => {
    const row = document.createElement('li');
    row.className = 'step';
    const number = document.createElement('span');
    number.className = 'step-number';
    number.textContent = String(i + 1);
    const label = document.createElement('span');
    label.className = 'step-text';
    label.textContent = text;
    row.append(number, label);
    return row;
  }));
  document.body.getBoundingClientRect();
  await Promise.all([
    document.fonts.ready,
    ...[...document.images].filter(img => img.hasAttribute('src')).map(img => img.decode()),
  ]);
  const subtitleBottom = get('subtitle').getBoundingClientRect().bottom;
  const width = data.width ?? 920;
  const card = get(data.image ? 'screen' : 'start-card');
  Object.assign(card.style, { width: `${width}px`, left: `${(1080 - width) / 2}px` });
  if (data.image) {
    const { x, y, w, h } = data.crop;
    const img = get('screen-image');
    const scale = width / w;
    const height = h * scale;
    const minTop = subtitleBottom + 48;
    const overhang = data.overlay ? 40 : 0;
    const groupHeight = Math.max(height + overhang,
      data.overlay ? get('notification').getBoundingClientRect().height : 0);
    const availableHeight = 1350 - 72 - minTop;
    if (groupHeight > availableHeight) {
      throw new Error('화면 카드의 전체 crop이 하단 72px 여백 위에 들어가지 않습니다.');
    }
    const groupTop = minTop + (availableHeight - groupHeight) / 2;
    const top = groupTop + overhang;
    if (img.naturalWidth !== 1170 || (x + w) * 3 > img.naturalWidth || (y + h) * 3 > img.naturalHeight) {
      throw new Error('스크린샷은 1170px 너비여야 하며 crop은 이미지 범위 안에 있어야 합니다.');
    }
    Object.assign(card.style, { top: `${top}px`, height: `${height}px` });
    Object.assign(img.style, { width: `${1170 / 3 * scale}px`, left: `${-x * scale}px`, top: `${-y * scale}px` });
    if (data.overlay) get('notification').style.top = `${top - 40}px`;
  } else {
    card.style.top = `${subtitleBottom + 64}px`;
  }
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// 말줄임표를 포함해 모든 표시 텍스트의 넘침과 캔버스 이탈을 검사합니다.
function inspectText() {
  const canvas = document.getElementById('canvas').getBoundingClientRect();
  const outside = r => r.left < canvas.left - 0.5 || r.top < canvas.top - 0.5 ||
    r.right > canvas.right + 0.5 || r.bottom > canvas.bottom + 0.5;
  const warnings = [];
  for (const el of document.querySelectorAll('#canvas *')) {
    if (!el.getClientRects().length || !el.textContent.trim()) continue;
    const textNodes = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (!textNodes.length) continue;
    const reasons = [];
    const rect = el.getBoundingClientRect();
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth) reasons.push('scrollWidth > clientWidth');
    if (outside(rect)) reasons.push('요소가 캔버스 밖으로 나감');
    for (const node of textNodes) {
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some(outside)) reasons.push('텍스트가 캔버스 밖으로 나감');
    }
    if (el.id === 'title' && rect.height > parseFloat(getComputedStyle(el).lineHeight) * 2 + 0.5) {
      reasons.push('제목이 두 줄을 초과함');
    }
    if (reasons.length) warnings.push(`${el.id || el.className || el.tagName}: ${[...new Set(reasons)].join(', ')} — ${el.textContent.trim()}`);
  }
  return warnings;
}

async function main() {
  const selected = selectSlides(process.argv.slice(2));
  selected.forEach(validateCrop);
  for (const name of ['PLAYWRIGHT_CORE', 'CHROME_PATH']) {
    if (!process.env[name] || !isAbsolute(process.env[name])) throw new Error(`${name}에 절대 경로를 설정하세요.`);
  }
  const localURL = path => pathToFileURL(resolve(ROOT, path)).href;
  const iconPath = '../raw/app-icon-192.png';
  await Promise.all(['scripts/photo.html', iconPath, ...selected.filter(s => s.image).map(s => s.image)]
    .map(path => access(resolve(ROOT, path))));
  const { chromium } = createRequire(process.env.PLAYWRIGHT_CORE + '/')('playwright-core');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    await mkdir(resolve(ROOT, 'final'), { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    for (const slide of selected) {
      await page.goto(localURL('scripts/photo.html'), { waitUntil: 'load' });
      const data = { ...slide, icon: localURL(iconPath), image: slide.image ? localURL(slide.image) : null };
      await page.evaluate(render, data).catch(error => { throw new Error(`[${slide.number}번] ${error.message}`); });
      for (const warning of await page.evaluate(inspectText)) console.warn(`[경고 ${slide.number}번] ${warning}`);
      await page.screenshot({ path: resolve(ROOT, slide.output), type: 'png', fullPage: false,
        clip: { x: 0, y: 0, width: 1080, height: 1350 }, scale: 'css' });
      console.log(`[${slide.number}번] ${slide.output}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
