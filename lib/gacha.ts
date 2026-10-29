import { WEAPONS, WEAPON_IDS } from "./weapons.ts";
import type { Grade, WeaponId } from "./weapons.ts";

// 무기 뽑기 (보물상자). 계정이 있으면 서버(supabase/gacha.sql)가 같은 규칙으로 뽑고 이 파일은 화면 표시와
// 체험 모드(Supabase 설정 없음)의 이 기기 뽑기에 쓴다. 숫자를 바꾸면 gacha.sql도 함께 바꾼다 (lib/gacha.test.ts가 맞는지 확인)

export const DAILY_KEYS = 5; // 하루 첫 접속 (한국 날짜 기준)
export const REVIEW_KEYS = 5; // 후기 댓글 하나
export const REVIEW_DAILY_MAX = 3; // 후기 선물은 하루 3번까지 (지운 댓글도 센다)
export const DRAW_COST = 10; // 열쇠조각 10개 = 뽑기 한 번

// 등급 확률 (1만 분의 몇). 전설 무기는 아직 없어서 그 자리에 "전설의 파편"이 나온다 (모아 두면 나중에 보상)
export type DrawGrade = Exclude<Grade, "legendary"> | "shard";
export const ODDS: [DrawGrade, number][] = [
  ["common", 8000],
  ["rare", 1900],
  ["heroic", 99],
  ["shard", 1],
];
export const ODDS_TOTAL = 10000;

// 이미 가진 무기가 나오면 열쇠조각을 일부 돌려준다 (일반 무기는 누구나 가지고 있어 늘 돌려받는다)
export const REFUND: Record<Exclude<DrawGrade, "shard">, number> = { common: 2, rare: 5, heroic: 10 };

// 확률 표에 쓰는 글자 (80%, 0.99%, 0.01%)
export const oddsPercent = (weight: number): string => `${Number(((weight / ODDS_TOTAL) * 100).toFixed(2))}%`;

// 등급마다 나올 수 있는 무기 (맨손·전설 자리는 빼고)
export const DRAW_POOL: Record<Exclude<DrawGrade, "shard">, WeaponId[]> = {
  common: WEAPON_IDS.filter((id) => WEAPONS[id].grade === "common" && WEAPONS[id].family !== "fist"),
  rare: WEAPON_IDS.filter((id) => WEAPONS[id].grade === "rare"),
  heroic: WEAPON_IDS.filter((id) => WEAPONS[id].grade === "heroic"),
};

// 0 이상 ODDS_TOTAL 미만의 수 하나로 등급을 정한다
export function gradeOf(roll: number): DrawGrade {
  let upTo = 0;
  for (const [grade, weight] of ODDS) {
    upTo += weight;
    if (roll < upTo) return grade;
  }
  return "shard";
}

export type DrawResult =
  | { kind: "weapon"; weapon: WeaponId; grade: Exclude<DrawGrade, "shard">; duplicate: boolean; refund: number }
  | { kind: "shard" };

// 뽑기 한 번 (random은 0 이상 1 미만). owned에는 얻은 무기(희귀 이상)를 넣는다
export function drawOnce(owned: ReadonlySet<string>, random: () => number = Math.random): DrawResult {
  const grade = gradeOf(Math.floor(random() * ODDS_TOTAL));
  if (grade === "shard") return { kind: "shard" };
  const pool = DRAW_POOL[grade];
  const weapon = pool[Math.floor(random() * pool.length)];
  const duplicate = grade === "common" || owned.has(weapon);
  return { kind: "weapon", weapon, grade, duplicate, refund: duplicate ? REFUND[grade] : 0 };
}

// 뽑기 결과에서 열쇠조각이 얼마나 바뀌는지 (뽑는 값 빼고 돌려받는 값 더함)
export const keysAfter = (keys: number, result: DrawResult): number => keys - DRAW_COST + (result.kind === "weapon" ? result.refund : 0);
