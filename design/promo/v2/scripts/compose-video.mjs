import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;
const FRAME_COUNT = 20 * FPS;
const POSTERS = new Map(['0', '1.2', '3.3', '4.6', '5.6', '8.6', '10.5', '12.5', '13.8', '16.0', '19.0']
  .map(seconds => [Math.round(Number(seconds) * FPS), seconds]));

// 화면 구성 후 글꼴과 모든 이미지가 준비될 때까지 기다립니다.
async function setup(data) {
  window.setup(data);
  document.body.getBoundingClientRect();
  await document.fonts.ready;
  await Promise.all([...document.images].map(image => image.decode()));
  for (const caption of document.querySelectorAll('.caption')) {
    const box = caption.getBoundingClientRect();
    const text = caption.querySelector('.caption-text');
    if (box.bottom >= 360 || box.right > 1000.5 ||
        caption.scrollWidth > caption.clientWidth + 1 ||
        (text && text.scrollWidth > text.clientWidth + 1)) {
      throw new Error(`자막이 지정 영역을 벗어났습니다: ${caption.textContent}`);
    }
  }
  window.renderAt(0);
}

// 같은 프레임 버퍼를 인코더와 확인용 이미지에 사용합니다.
async function writeFrame(stream, png, completion) {
  if (!stream.write(png)) {
    await Promise.race([
      once(stream, 'drain'),
      completion.then(() => { throw new Error('프레임 입력 전에 인코더가 종료되었습니다.'); }),
    ]);
  }
}

async function main() {
  for (const key of ['PLAYWRIGHT_CORE', 'CHROME_PATH', 'FFMPEG']) {
    if (!process.env[key]) throw new Error(`${key} 환경 변수를 지정해 주세요.`);
  }
  const { chromium } = createRequire(process.env.PLAYWRIGHT_CORE + '/')('playwright-core');
  const data = JSON.parse(await readFile(resolve(ROOT, 'video-raw/states.json'), 'utf8'));
  const imagePaths = data.states.map(state => resolve(ROOT, 'video-raw', state.file));
  const iconPath = resolve(ROOT, '../raw/app-icon-192.png');
  const htmlPath = resolve(ROOT, 'scripts/video.html');
  await Promise.all([...imagePaths, iconPath, htmlPath].map(file => access(file)));
  data.states = data.states.map((state, index) => ({ ...state, url: pathToFileURL(imagePaths[index]).href }));
  data.iconUrl = pathToFileURL(iconPath).href;

  let browser;
  let encoder;
  let completion;
  let encoderError;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1,
      locale: 'ko-KR', colorScheme: 'light', reducedMotion: 'reduce',
    });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.evaluate(setup, data);
    await mkdir(resolve(ROOT, 'final/frames-check'), { recursive: true });

    // 고화질 H.264 설정으로 PNG 프레임을 순서대로 인코딩합니다.
    encoder = spawn(process.env.FFMPEG, [
      '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p',
      '-profile:v', 'high', '-movflags', '+faststart', 'final/demo-reel.mp4',
    ], { cwd: ROOT, stdio: ['pipe', 'ignore', 'inherit'], windowsHide: true });
    encoder.stdin.on('error', error => { encoderError = error; });
    completion = new Promise((resolveDone, reject) => {
      encoder.once('error', reject);
      encoder.once('close', (code, signal) => code === 0 ? resolveDone() :
        reject(new Error(`영상 인코딩 실패: ${signal ?? code}`)));
    });
    completion.catch(error => { encoderError = error; });

    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      if (encoderError) throw encoderError;
      await page.evaluate(t => renderAt(t), frame / FPS);
      const png = await page.screenshot({ type: 'png' });
      if (encoderError) throw encoderError;
      await writeFrame(encoder.stdin, png, completion);
      if (POSTERS.has(frame)) {
        await writeFile(resolve(ROOT, `final/frames-check/t${POSTERS.get(frame)}.png`), png);
      }
      if ((frame + 1) % 60 === 0) console.log(`진행: ${frame + 1}/${FRAME_COUNT} 프레임`);
    }
    encoder.stdin.end();
    await completion;
    console.log('저장 완료: final/demo-reel.mp4');
  } finally {
    if (encoder && encoder.exitCode === null && encoder.signalCode === null) {
      encoder.stdin.destroy();
      encoder.kill();
    }
    await completion?.catch(() => {});
    await browser?.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
