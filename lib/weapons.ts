import type { EffectId } from "./pixel-effects.ts";

// 무기: 내 캐릭터가 손에 드는 것. 무기가 관심 표시(☆)를 켜 주는 스킬과 이펙트를 정한다.
//   계열(family)이 스킬의 종류를, 등급(grade)이 화려함을 정한다. 일반은 단출하게, 영웅으로 갈수록 화려하게.
//   일반 무기는 모두 기본으로 받는다. 희귀부터는 정해진 경로로 얻는다 (얻는 방법은 아직 미정 → 잠긴 채로 보인다).
//   화면에서는 무기와 스킬의 관계를 설명하지 않는다 (바꿔 보며 알아채는 숨은 재미)
// 손에 든 그림은 lib/weapon-sprites.ts, 스킬 동작은 components/StarHelper.tsx, 이펙트는 lib/pixel-effects.ts

export type WeaponFamily = "sword" | "staff" | "bow" | "relic" | "pen" | "instrument" | "fist";
export type Grade = "common" | "rare" | "heroic" | "legendary";

export const GRADE_NAMES: Record<Grade, string> = { common: "일반", rare: "희귀", heroic: "영웅", legendary: "전설" };
export const GRADES: Grade[] = ["common", "rare", "heroic", "legendary"];

// 스킬: 별을 켜 주는 동작 (components/StarHelper.tsx의 SKILLS)
export type SkillId =
  | "fist-tap" // 맨손: 달려가 주먹으로 톡
  | "approach-slash" // 목검: 다가가서 베기
  | "slash-wave" // 청람검: 검기를 날림
  | "blossom-wave" // 벚꽃검: 꽃잎 검기 3연발
  | "magic-orb" // 견습 지팡이: 마법 구슬을 날림
  | "star-bolt" // 별빛 지팡이: 별 에너지탄
  | "tsunami" // 해일의 지팡이: 해일
  | "arrow" // 단궁: 화살 한 발
  | "wind-arrow" // 바람활: 바람 화살
  | "meteor-rain" // 유성궁: 유성 화살비
  | "holy-dot" // 나무 지팡이: 작은 빛
  | "light-pillar" // 성광 지팡이: 빛기둥
  | "angel-wings" // 천사의 홀: 날개 후광과 빛기둥
  | "pencil-poke" // 연필: 다가가서 콕
  | "ink-circle" // 만년필: 잉크 동그라미
  | "letter-storm" // 깃펜: 글자 폭풍과 도장
  | "note-float" // 리코더: 음표 하나
  | "note-line" // 기타: 음표 여러 개
  | "sound-ring"; // 그랜드 하프: 무지개 음파

export interface WeaponDef {
  name: string;
  family: WeaponFamily;
  grade: Grade;
  skill: SkillId;
  effect: EffectId | null; // 별이 켜질 때 터지고 평소 캐릭터 주변을 떠다니는 이펙트 (일반은 없음)
}

export const WEAPONS = {
  "bare-hands": { name: "맨손", family: "fist", grade: "common", skill: "fist-tap", effect: null },
  "wooden-sword": { name: "목검", family: "sword", grade: "common", skill: "approach-slash", effect: null },
  "apprentice-wand": { name: "견습 지팡이", family: "staff", grade: "common", skill: "magic-orb", effect: null },
  "short-bow": { name: "단궁", family: "bow", grade: "common", skill: "arrow", effect: null },
  "oak-staff": { name: "나무 지팡이", family: "relic", grade: "common", skill: "holy-dot", effect: null },
  pencil: { name: "연필", family: "pen", grade: "common", skill: "pencil-poke", effect: null },
  recorder: { name: "리코더", family: "instrument", grade: "common", skill: "note-float", effect: null },

  "azure-blade": { name: "청람검", family: "sword", grade: "rare", skill: "slash-wave", effect: "bolt" },
  "starlight-wand": { name: "별빛 지팡이", family: "staff", grade: "rare", skill: "star-bolt", effect: "snow" },
  "wind-bow": { name: "바람활", family: "bow", grade: "rare", skill: "wind-arrow", effect: "leaf" },
  "radiant-staff": { name: "성광 지팡이", family: "relic", grade: "rare", skill: "light-pillar", effect: "heart" },
  "fountain-pen": { name: "만년필", family: "pen", grade: "rare", skill: "ink-circle", effect: "shadow" },
  guitar: { name: "기타", family: "instrument", grade: "rare", skill: "note-line", effect: "note" },

  "blossom-blade": { name: "벚꽃검 '춘풍'", family: "sword", grade: "heroic", skill: "blossom-wave", effect: "petal" },
  "tide-staff": { name: "해일의 지팡이", family: "staff", grade: "heroic", skill: "tsunami", effect: "bubble" },
  "meteor-bow": { name: "유성궁", family: "bow", grade: "heroic", skill: "meteor-rain", effect: "flame" },
  "angel-scepter": { name: "천사의 홀", family: "relic", grade: "heroic", skill: "angel-wings", effect: "sparkle" },
  "victory-quill": { name: "깃펜 '필승'", family: "pen", grade: "heroic", skill: "letter-storm", effect: "coin" },
  "grand-harp": { name: "그랜드 하프", family: "instrument", grade: "heroic", skill: "sound-ring", effect: "rainbow" },
  // 전설: 자리만 있다 (디자인은 나중에). 지금은 누구도 가질 수 없다
  "legend-1": { name: "???", family: "sword", grade: "legendary", skill: "blossom-wave", effect: "sparkle" },
} satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export const weaponOf = (id: WeaponId): WeaponDef => WEAPONS[id];
export const isWeaponId = (value: unknown): value is WeaponId => typeof value === "string" && value in WEAPONS;

// 기본으로 받는 무기 (일반 등급 전부)
export const STARTER_WEAPONS = WEAPON_IDS.filter((id) => WEAPONS[id].grade === "common");

// 그 계열의 일반 무기 (가진 적 없는 무기를 들고 있으면 이것으로 바꾼다)
export function starterOf(family: WeaponFamily): WeaponId {
  return STARTER_WEAPONS.find((id) => WEAPONS[id].family === family) ?? "bare-hands";
}

// 예전에 저장한 무기 이름 (계열 이름) → 그 계열의 일반 무기
const LEGACY: Record<string, WeaponId> = {
  sword: "wooden-sword",
  wand: "apprentice-wand",
  bow: "short-bow",
  staff: "oak-staff",
  none: "bare-hands",
};
export const upgradeWeaponId = (value: unknown): WeaponId | null =>
  isWeaponId(value) ? value : typeof value === "string" ? (LEGACY[value] ?? null) : null;

// 이 무기를 가졌는지. 일반은 누구나, 그 밖에는 얻은 무기 목록(owned)에 있어야 한다
export const owns = (owned: ReadonlySet<string>, id: WeaponId) => WEAPONS[id].grade === "common" || owned.has(id);
