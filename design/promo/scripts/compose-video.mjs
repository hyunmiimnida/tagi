import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const local = (file) => path.join(root, file);
const layer = (name) => local(`recording/layers/${name}.png`);
const captions = [
  ['list', '<em>우리 학교</em>를 고르고'],
  ['tag', '<em>관심 분야</em>를 고르면'],
  ['open', '필요한 공고만<br><em>한눈에</em>'],
  ['favorite', '<em>관심 표시</em>하면'],
  ['calendar', '캘린더에<br><em>마감일</em>이 모여요'],
];

// 사진 스크립트와 같은 방식으로 불러와요.
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

// MP4 헤더에서 실제 길이를 읽어요. ffprobe는 필요 없어요.
function recordingDuration(buffer) {
  function find(start, end) {
    for (let at = start; at + 8 <= end;) {
      let size = buffer.readUInt32BE(at);
      const type = buffer.toString('ascii', at + 4, at + 8);
      let header = 8;
      if (size === 1) {
        if (at + 16 > end) break;
        size = Number(buffer.readBigUInt64BE(at + 8));
        header = 16;
      }
      if (size === 0) size = end - at;
      if (size < header || at + size > end) break;
      const data = at + header;
      if (type === 'moov') return find(data, at + size);
      if (type === 'mvhd') {
        const version = buffer[data];
        if (version !== 0 && version !== 1) break;
        const scaleAt = data + (version === 1 ? 20 : 12);
        const scale = buffer.readUInt32BE(scaleAt);
        const ticks = version === 1 ? Number(buffer.readBigUInt64BE(scaleAt + 4)) : buffer.readUInt32BE(scaleAt + 4);
        if (scale && ticks > 0) return ticks / scale;
      }
      at += size;
    }
    throw new Error('MP4에서 재생 시간을 읽을 수 없어요.');
  }
  return find(0, buffer.length);
}

function sceneTimes(data, duration) {
  const offset = data.firstFrameEpoch - data.startEpoch;
  if (!Number.isFinite(offset)) throw new Error('장면 시작 시간이 올바르지 않아요.');
  const times = captions.map(([name], index) => {
    const scene = data.scenes.find((item) => item.name === name);
    if (!scene || !Number.isFinite(scene.t)) throw new Error(`장면 시간이 없어요: ${name}`);
    return index === 0 ? 0 : Math.max(0, scene.t - offset);
  });
  if (times.some((time, i) => time >= duration || (i && time < times[i - 1] + 0.25))) {
    throw new Error('장면 순서나 간격을 확인하세요.');
  }
  return times;
}

async function renderLayers() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(local('scripts/video-card.html')).href, { waitUntil: 'load' });
    const jobs = [
      { name: 'background', mode: 'background' },
      { name: 'mask', mode: 'mask', clip: { x: 228, y: 440, width: 624, height: 1350 } },
      ...captions.map(([name, caption]) => ({ name, caption, mode: 'caption', clip: { x: 0, y: 180, width: 1080, height: 180 } })),
      { name: 'end', mode: 'end' },
    ];
    for (const job of jobs) {
      await page.evaluate((data) => window.renderCard(data), { ...job, icon: pathToFileURL(local('raw/app-icon-192.png')).href });
      await page.screenshot({ path: layer(job.name), type: 'png', omitBackground: job.mode === 'caption', ...(job.clip ? { clip: job.clip } : {}) });
    }
  } finally {
    await browser.close();
  }
}

function ffmpegArguments(duration, times) {
  const args = ['-y', '-i', local('recording/raw-screen.mp4')];
  for (const name of ['background', 'mask', ...captions.map(([name]) => name), 'end']) {
    args.push('-loop', '1', '-framerate', '30', '-i', layer(name));
  }
  const filters = [
    '[0:v]fps=30,scale=624:1350,setsar=1,settb=AVTB,setpts=PTS-STARTPTS,format=rgba[screen]',
    '[2:v]format=gray[mask]',
    '[screen][mask]alphamerge[rounded]',
    '[1:v]setsar=1,settb=AVTB,setpts=PTS-STARTPTS[bg]',
    '[bg][rounded]overlay=228:440:shortest=1:format=auto[base0]',
  ];
  captions.forEach((_, i) => {
    const fades = ['format=rgba'];
    if (i) fades.push(`fade=t=in:st=${times[i]}:d=0.25:alpha=1`);
    if (i < captions.length - 1) fades.push(`fade=t=out:st=${times[i + 1]}:d=0.25:alpha=1`);
    filters.push(`[${i + 3}:v]${fades.join(',')}[caption${i}]`);
    // 자막만 겹쳐서 화면 녹화는 끊김 없이 이어져요.
    filters.push(`[base${i}][caption${i}]overlay=0:180:shortest=1:format=auto[base${i + 1}]`);
  });
  // 마지막 화면을 잠시 멈추고 종료 카드로 이어져요.
  filters.push(
    `[base5]trim=duration=${duration},tpad=stop_mode=clone:stop_duration=0.4,fps=30,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[reel]`,
    '[8:v]trim=duration=3,setsar=1,fps=30,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[end]',
    `[reel][end]xfade=transition=fade:duration=0.4:offset=${duration}[out]`,
  );
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-an', '-t', String(duration + 3),
    '-r', '30', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', local('final/demo-reel.mp4'));
  return args;
}

async function runFfmpeg(args) {
  console.log([process.env.FFMPEG, ...args].map((arg) => JSON.stringify(arg)).join(' '));
  await new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG, args, { stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg 종료 코드: ${code}`)));
  });
}

async function main() {
  if (!process.env.FFMPEG || !process.env.CHROME_PATH) throw new Error('FFMPEG와 CHROME_PATH를 지정하세요.');
  const duration = recordingDuration(await readFile(local('recording/raw-screen.mp4')));
  const times = sceneTimes(JSON.parse(await readFile(local('recording/scenes.json'), 'utf8')), duration);
  await mkdir(local('recording/layers'), { recursive: true });
  await mkdir(local('final'), { recursive: true });
  await renderLayers();
  await runFfmpeg(ffmpegArguments(duration, times));
  console.log(`저장: ${local('final/demo-reel.mp4')}\n길이: ${(duration + 3).toFixed(3)}초`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
