import type { EffectId } from "./pixel-effects.ts";
import { EXTRA_WEAPONS } from "./weapons-extra.ts";

// 무기: 내 캐릭터가 손에 드는 것. 무기가 관심 표시(☆)를 켜 주는 스킬과 이펙트를 정한다.
//   계열(family)이 스킬의 종류를, 등급(grade)이 화려함을 정한다. 일반은 단출하게, 영웅으로 갈수록 화려하게.
//   처음부터 가진 무기는 맨손 하나. 일반 무기부터는 보물상자 뽑기(lib/gacha.ts)로 얻는다 (못 얻은 무기는 잠긴 채로 보인다).
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
  | "holy-dot" // 참나무 지팡이: 작은 빛
  | "light-pillar" // 성광 지팡이: 빛기둥
  | "angel-wings" // 천사의 홀: 날개 후광과 빛기둥
  | "pencil-poke" // 서기의 철필: 다가가서 콕
  | "ink-circle" // 밤잉크 펜: 잉크 동그라미
  | "letter-storm" // 깃펜: 글자 폭풍과 도장
  | "note-float" // 목동의 피리: 음표 하나
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
  "bare-hands": { name: "맨손", family: "fist", grade: "common", skill: "fist-tap", effect: null, flavor: "모든 모험가가 처음 쥐어 본 무기는 자기 주먹이었다." },
  "wooden-sword": { name: "목검", family: "sword", grade: "common", skill: "approach-slash", effect: null, flavor: "수련생들의 손때가 반질반질하게 밴 나무 검." },
  "apprentice-wand": { name: "견습 지팡이", family: "staff", grade: "common", skill: "magic-orb", effect: null, flavor: "견습 마법사에게 처음 쥐여 주는, 끝이 뭉툭한 지팡이." },
  "short-bow": { name: "단궁", family: "bow", grade: "common", skill: "arrow", effect: null, flavor: "사냥꾼의 아이들이 가장 먼저 배우는 가볍고 짧은 활." },
  "oak-staff": { name: "참나무 지팡이", family: "relic", grade: "common", skill: "holy-dot", effect: null, flavor: "마을 사제가 순례길에 짚고 다니던 오래된 참나무 지팡이." },
  pencil: { name: "서기의 철필", family: "pen", grade: "common", skill: "pencil-poke", effect: null, flavor: "왕궁 서기들이 장부를 적을 때 쓰는, 끝이 단단한 철필." },
  recorder: { name: "목동의 피리", family: "instrument", grade: "common", skill: "note-float", effect: null, flavor: "언덕 위 양 떼를 불러 모으던 소박한 나무 피리." },

  "azure-blade": { name: "청람검", family: "sword", grade: "rare", skill: "slash-wave", effect: "bolt", flavor: "깊은 호수의 푸른빛이 날에 스며든 검. 맑은 새벽이면 칼끝에 이슬이 맺힌다." },
  "starlight-wand": { name: "별빛 지팡이", family: "staff", grade: "rare", skill: "star-bolt", effect: "snow", flavor: "별이 가장 많이 뜨는 밤에만 깎을 수 있다는 지팡이. 끝에 매단 수정은 한낮에도 희미하게 반짝인다." },
  "wind-bow": { name: "바람활", family: "bow", grade: "rare", skill: "wind-arrow", effect: "leaf", flavor: "바람이 잠들지 않는 고원에서 만든 활. 시위를 당기면 주변 풀잎이 먼저 고개를 숙인다." },
  "radiant-staff": { name: "성광 지팡이", family: "relic", grade: "rare", skill: "light-pillar", effect: "heart", flavor: "새해 첫 햇살을 받아 축성한 지팡이. 들고 걸으면 어두운 회랑에서도 그림자가 짧아진다." },
  "fountain-pen": { name: "밤잉크 펜", family: "pen", grade: "rare", skill: "ink-circle", effect: "shadow", flavor: "마르지 않는 밤의 잉크를 품은 펜. 이것으로 쓴 글자는 해가 뜨기 전까지 결코 번지지 않는다." },
  guitar: { name: "음유시인의 류트", family: "instrument", grade: "rare", skill: "note-line", effect: "note", flavor: "떠돌이 음유시인이 백 곳의 여관을 돌며 연주한 류트. 줄마다 다른 마을의 노래가 배어 있다." },

  "blossom-blade": { name: "벚꽃검 '춘풍'", family: "sword", grade: "heroic", skill: "blossom-wave", effect: "petal", flavor: "누군가의 기억 속에 아직 선명한 어느 봄날의 벚꽃 길을 그대로 담아낸 검. 칼집에서 뽑는 순간 바람의 결이 바뀌고, 지나간 자리마다 늦게 진 꽃잎이 흩날린다. 처음 이 검을 벼린 이는 다시 오지 않을 봄을 붙잡아 두고 싶었다고 한다." },
  "tide-staff": { name: "해일의 지팡이", family: "staff", grade: "heroic", skill: "tsunami", effect: "bubble", flavor: "잠든 바다의 깊은 숨을 한 줌 떠서 가둔 지팡이. 귀를 대면 먼 수평선에서 밀려오는 파도 소리가 들리고, 끝에 맺힌 물방울은 결코 마르지 않는다. 바다가 성을 내는 밤이면 지팡이도 함께 들썩인다고 전해진다." },
  "meteor-bow": { name: "유성궁", family: "bow", grade: "heroic", skill: "meteor-rain", effect: "flame", flavor: "별똥별이 쏟아지던 밤, 하늘에서 떨어진 운석 조각으로 활대를 깎았다. 시위는 별의 꼬리를 꼬아 만들어 어둠 속에서 은은히 타오른다. 이 활로 쏜 화살은 땅에 닿기 전에 소원 하나를 듣고 간다는 이야기가 있다." },
  "angel-scepter": { name: "천사의 홀", family: "relic", grade: "heroic", skill: "angel-wings", effect: "sparkle", flavor: "하늘 회랑을 지키던 수호천사가 땅으로 내려오며 남긴 홀. 머리에 달린 작은 날개는 누군가의 기도를 들을 때마다 살며시 떨린다. 이 홀 앞에서는 거짓말이 목에 걸려 나오지 않는다고 한다." },
  "victory-quill": { name: "깃펜 '필승'", family: "pen", grade: "heroic", skill: "letter-storm", effect: "coin", flavor: "전설의 서기관이 마지막 결전의 맹세문을 적었다는 깃펜. 펜대에는 끝내 승리한 이들의 이름이 금빛으로 새겨져 있다. 이것으로 다짐을 적으면 글자가 저절로 굵어진다는 소문이 돈다." },
  "grand-harp": { name: "그랜드 하프", family: "instrument", grade: "heroic", skill: "sound-ring", effect: "rainbow", flavor: "일곱 빛깔 무지개를 한 가닥씩 걷어 현으로 건 하프. 비가 갠 오후에만 조율할 수 있어, 연주자는 평생 하늘을 올려다보며 산다. 마지막 음이 사라질 때면 듣는 이의 눈가에 옅은 무지개가 걸린다." },
  // 전설: 자리만 있다 (디자인은 나중에). 지금은 누구도 가질 수 없다
  "legend-1": { name: "???", family: "sword", grade: "legendary", skill: "blossom-wave", effect: "sparkle", flavor: "아직 아무도 본 적 없는 무기." },
} satisfies Record<string, WeaponDef>;

// 추가 무기 (Codex가 기획·제작, lib/weapons-extra.ts). 스킬은 대본(recipe)으로
export const WEAPONS = { ...BASE_WEAPONS, ...EXTRA_WEAPONS };

export type WeaponId = keyof typeof WEAPONS;
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export const weaponOf = (id: WeaponId): WeaponDef => WEAPONS[id];
export const isWeaponId = (value: unknown): value is WeaponId => typeof value === "string" && value in WEAPONS;

// 처음부터 가진 무기는 맨손 하나. 나머지(일반 포함)는 보물상자 뽑기(lib/gacha.ts)로 얻는다.
// 가진 적 없는 무기를 들고 있으면 맨손으로 바꾼다
export const STARTER_WEAPON: WeaponId = "bare-hands";

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

// 이 무기를 가졌는지. 맨손은 누구나, 그 밖에는 얻은 무기 목록(owned)에 있어야 한다
export const owns = (owned: ReadonlySet<string>, id: WeaponId) => id === STARTER_WEAPON || owned.has(id);
