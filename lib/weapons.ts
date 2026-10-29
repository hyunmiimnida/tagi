import type { EffectId } from "./pixel-effects.ts";
import { EXTRA_WEAPONS } from "./weapons-extra.ts";

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

// 스킬 대본: 단계를 차례로 실행한다 (components/StarHelper.tsx의 runRecipe). 새 무기는 코드 없이 대본만으로 스킬을 만든다
//   standUp(제자리에서 일어남) … hide(다시 숨음) / goToStar(별까지 달려감) … goHome(돌아옴), tap = 별이 켜지는 순간(한 번)
export type RecipeStep =
  | { do: "standUp" | "goToStar" | "goHome" | "hide" | "tap" | "beam" | "slash" }
  | { do: "pose"; pose: string; ms?: number }
  | { do: "shoot"; fx: string; from?: "hand" | "sky" | "ground"; ms?: number; arc?: number; count?: number; stagger?: number; spread?: number; frameMs?: number }
  | { do: "play"; fx: string; at?: "star" | "self"; frameMs?: number; ax?: number; ay?: number; wait?: boolean }
  | { do: "spark"; color?: string }
  | { do: "wait"; ms: number };

export interface WeaponDef {
  name: string;
  family: WeaponFamily;
  grade: Grade;
  skill: SkillId;
  effect: EffectId | null; // 별이 켜질 때 터지고 평소 캐릭터 주변을 떠다니는 이펙트 (일반은 없음)
  recipe?: RecipeStep[]; // 있으면 skill 대신 이 대본으로 별을 켠다
  flavor?: string; // 도감에 보이는 한 줄 설명 (무기 이야기. 스킬은 설명하지 않는다)
}

const BASE_WEAPONS = {
  "bare-hands": { name: "맨손", family: "fist", grade: "common", skill: "fist-tap", effect: null, flavor: "언제나 함께하는 두 손." },
  "wooden-sword": { name: "목검", family: "sword", grade: "common", skill: "approach-slash", effect: null, flavor: "수련장 한쪽에 늘 세워져 있던 나무 검." },
  "apprentice-wand": { name: "견습 지팡이", family: "staff", grade: "common", skill: "magic-orb", effect: null, flavor: "입학 첫날 받은 견습생용 지팡이." },
  "short-bow": { name: "단궁", family: "bow", grade: "common", skill: "arrow", effect: null, flavor: "가볍고 다루기 쉬운 짧은 활." },
  "oak-staff": { name: "나무 지팡이", family: "relic", grade: "common", skill: "holy-dot", effect: null, flavor: "오래된 참나무를 깎아 만든 지팡이." },
  pencil: { name: "연필", family: "pen", grade: "common", skill: "pencil-poke", effect: null, flavor: "시험 날 꼭 챙기는 노란 연필." },
  recorder: { name: "리코더", family: "instrument", grade: "common", skill: "note-float", effect: null, flavor: "음악 시간의 추억이 담긴 리코더." },

  "azure-blade": { name: "청람검", family: "sword", grade: "rare", skill: "slash-wave", effect: "bolt", flavor: "푸른 강철을 벼려 만든 검." },
  "starlight-wand": { name: "별빛 지팡이", family: "staff", grade: "rare", skill: "star-bolt", effect: "snow", flavor: "밤하늘 별빛을 담아 둔 지팡이." },
  "wind-bow": { name: "바람활", family: "bow", grade: "rare", skill: "wind-arrow", effect: "leaf", flavor: "잎사귀 장식에 바람이 깃든 활." },
  "radiant-staff": { name: "성광 지팡이", family: "relic", grade: "rare", skill: "light-pillar", effect: "heart", flavor: "한낮의 햇살을 머금은 지팡이." },
  "fountain-pen": { name: "만년필", family: "pen", grade: "rare", skill: "ink-circle", effect: "shadow", flavor: "밤새 쓴 리포트의 잉크가 아직 마르지 않았다." },
  guitar: { name: "기타", family: "instrument", grade: "rare", skill: "note-line", effect: "note", flavor: "동아리방에서 가장 많이 울린 기타." },

  "blossom-blade": { name: "벚꽃검 '춘풍'", family: "sword", grade: "heroic", skill: "blossom-wave", effect: "petal", flavor: "봄바람의 이름을 받은 벚꽃빛 검." },
  "tide-staff": { name: "해일의 지팡이", family: "staff", grade: "heroic", skill: "tsunami", effect: "bubble", flavor: "바다의 숨결이 소용돌이치는 지팡이." },
  "meteor-bow": { name: "유성궁", family: "bow", grade: "heroic", skill: "meteor-rain", effect: "flame", flavor: "별똥별이 떨어진 밤에 만들어졌다는 활." },
  "angel-scepter": { name: "천사의 홀", family: "relic", grade: "heroic", skill: "angel-wings", effect: "sparkle", flavor: "작은 날개가 달린 성스러운 홀." },
  "victory-quill": { name: "깃펜 '필승'", family: "pen", grade: "heroic", skill: "letter-storm", effect: "coin", flavor: "\"필승\"을 새긴 깃털 펜. 합격을 부른다는 소문이 있다." },
  "grand-harp": { name: "그랜드 하프", family: "instrument", grade: "heroic", skill: "sound-ring", effect: "rainbow", flavor: "무지갯빛 현이 걸린 커다란 하프." },
  // 전설: 자리만 있다 (디자인은 나중에). 지금은 누구도 가질 수 없다
  "legend-1": { name: "???", family: "sword", grade: "legendary", skill: "blossom-wave", effect: "sparkle", flavor: "아직 아무도 본 적 없는 무기." },
} satisfies Record<string, WeaponDef>;

// 추가 무기 (Codex가 기획·제작, lib/weapons-extra.ts). 스킬은 대본(recipe)으로
export const WEAPONS = { ...BASE_WEAPONS, ...EXTRA_WEAPONS };

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
