import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_NAME } from "./filter.ts";
import { PAL_HEIGHT, palRows, palSvg } from "./pixel-pals.ts";

// 공유 미리보기 이미지(카카오톡·메신저에 링크를 보낼 때 보이는 카드). 빌드할 때 만들어 둔다.
// 한글 글꼴(Pretendard, 사이트와 같은 글꼴)은 빌드 중 한 번만 받아 재사용한다
export const OG_SIZE = { width: 1200, height: 630 };
// 압축 글꼴(woff)은 그림을 만들 때 풀다가 오류가 나서(invalid distance), 압축하지 않은 otf를 쓴다
const FONT_URL = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-Bold.otf";
let font: Promise<ArrayBuffer> | null = null;
// 사이트 로고 (public/icon-192.png)를 그림 주소로
const LOGO = `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "icon-192.png")).toString("base64")}`;
// 흰 카드 윗선을 두 손으로 잡고 빼꼼하는 마법사 (사이트의 도트 캐릭터와 같은 그림, 도트 한 칸 = 7px)
const PEEK_SCALE = 7;
const PEEK = `data:image/svg+xml;base64,${Buffer.from(palSvg(palRows("wizard", "peek"), PEEK_SCALE)).toString("base64")}`;
async function fetchFont(tries = 3): Promise<ArrayBuffer> {
  const res = await fetch(FONT_URL);
  const data = await res.arrayBuffer();
  if (res.ok && data.byteLength > 1_000_000) return data;
  if (tries <= 1) throw new Error(`글꼴을 받지 못함 (${res.status}, ${data.byteLength}바이트)`);
  return fetchFont(tries - 1);
}
const loadFont = () => (font ??= fetchFont());

interface Card {
  badges: string[]; // 예: ["영남대", "다른 학교도 지원"]
  title: string;
  lines: string[]; // 예: ["모집 ~ 10.30(금)", "학생성공처"]
}

export async function renderCard({ badges, title, lines }: Card): Promise<ImageResponse> {
  const shortTitle = title.length > 70 ? `${title.slice(0, 68)}…` : title;
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#f2f4f6", padding: 56 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, color: "#2f5fd0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} width={44} height={44} alt="" />
          {SITE_NAME}
        </div>
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            marginTop: 32,
            padding: "44px 48px",
            borderRadius: 32,
            background: "#ffffff",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={PEEK}
            width={16 * PEEK_SCALE}
            height={PAL_HEIGHT.peek * PEEK_SCALE}
            alt=""
            style={{ position: "absolute", right: 64, top: -(PAL_HEIGHT.peek - 2) * PEEK_SCALE }}
          />
          <div style={{ display: "flex", gap: 12 }}>
            {badges.map((badge) => (
              <div
                key={badge}
                style={{ display: "flex", padding: "6px 16px", borderRadius: 10, background: "#e8efff", color: "#2f5fd0", fontSize: 26 }}
              >
                {badge}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 52, lineHeight: 1.3, color: "#191f28", letterSpacing: -1, wordBreak: "keep-all" }}>
            {shortTitle}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 8, fontSize: 30, color: "#4e5968" }}>
            {lines.map((line) => (
              <div key={line} style={{ display: "flex" }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Pretendard", data: await loadFont(), weight: 700, style: "normal" }] },
  );
}
