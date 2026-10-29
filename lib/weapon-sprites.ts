import { WEAPONS, WEAPON_IDS } from "./weapons.ts";
import type { WeaponFamily, WeaponId } from "./weapons.ts";

// 손에 든 무기 그림. 동작 그림(24×17, lib/pixel-pals.ts의 actionRows) 위에 도장처럼 찍는다: x·y = 왼쪽 위 칸
// 계열마다 자세(pose)가 정해져 있고, 동작 프레임이 어느 자세를 쓰는지는 POSE_OF가 정한다

export type WeaponPose = "stand" | "windup" | "strike" | "cast" | "draw" | "release" | "pray" | "poke" | "play" | "punch";
export interface Stamp {
  x: number;
  y: number;
  rows: string[];
}

export const FAMILY_POSES: Record<WeaponFamily, WeaponPose[]> = {
  sword: ["stand", "windup", "strike"],
  staff: ["stand", "cast"],
  bow: ["stand", "draw", "release"],
  relic: ["stand", "pray"],
  pen: ["stand", "poke"],
  instrument: ["stand", "play"],
  fist: ["punch"],
};

// 계열의 기본 그림 (무기마다 그림이 없을 때 쓴다)
const SWORD = [".K.", "KWK", "KMK", "KMK", "KMK", "KMK", "YYY", ".t."];
const BOW_DRAWN = ["......T....", ".......T...", "........T..", "........T..", "........T..", "WttttttttMM", "........T..", ".......T...", "......T...."];
const BOW = BOW_DRAWN.map((row, i) => (i === 5 ? "........T.." : row));
const WAND = [".Y.", "YWY", ".Y.", ".t.", ".t."];
const STAFF = ["YYY", "YWY", "YYY", ".t.", ".t.", ".t.", ".t.", ".t.", ".t.", ".t.", ".t."];
const PENCIL = ["P", "Y", "Y", "Y", "Y", "T", "K"];
const RECORDER = ["B", "B", "b", "B", "b", "B", "B"];

const FAMILY_SPRITES: Record<WeaponFamily, Partial<Record<WeaponPose, Stamp>>> = {
  sword: {
    stand: { x: 17, y: 6, rows: SWORD },
    windup: { x: 18, y: 0, rows: SWORD },
    strike: { x: 16, y: 12, rows: ["Y.KKKKK.", "YtMMMMMW", "Y.KKKKK."] },
  },
  staff: { stand: { x: 17, y: 9, rows: WAND }, cast: { x: 19, y: 3, rows: WAND } },
  bow: { stand: { x: 15, y: 6, rows: BOW }, draw: { x: 13, y: 8, rows: BOW_DRAWN }, release: { x: 13, y: 8, rows: BOW } },
  relic: { stand: { x: 17, y: 4, rows: STAFF }, pray: { x: 18, y: 1, rows: STAFF } },
  pen: { stand: { x: 18, y: 8, rows: PENCIL }, poke: { x: 16, y: 13, rows: ["TYYYYYK"] } },
  instrument: { stand: { x: 18, y: 8, rows: RECORDER }, play: { x: 16, y: 12, rows: ["BbBbBBK"] } },
  fist: { punch: { x: 15, y: 12, rows: ["KKKK.", "KSSSK", "KSPSK", "KKKK."] } },
};

// 무기마다 그린 그림 (Codex가 그리고 검수, 일반 < 희귀 < 영웅으로 화려해짐). 없는 무기·자세는 계열 기본 그림
const DRAWN: Partial<Record<WeaponId, Partial<Record<WeaponPose, Stamp>>>> = {
  "wooden-sword": {
    stand: {
      x: 18,
      y: 6,
      rows: [".K.", "KTK", "KTK", "KTK", "KTK", "KtK", "TTT", ".t."],
    },
    windup: {
      x: 19,
      y: 0,
      rows: [".K.", "KTK", "KTK", "KTK", "KTK", "KtK", "TTT", ".t."],
    },
    strike: {
      x: 16,
      y: 12,
      rows: ["T.KKKKK.", "TtTTTTTK", "T.KKKKK."],
    },
  },
  "azure-blade": {
    stand: {
      x: 18,
      y: 5,
      rows: [".I.", "dId", "dID", "dID", "dDD", "dDD", "dDd", "YYY", ".G."],
    },
    windup: {
      x: 19,
      y: 0,
      rows: [".I.", "dId", "dID", "dID", "dDD", "dDD", "dDd", "YYY", ".G."],
    },
    strike: {
      x: 16,
      y: 12,
      rows: ["Y.ddddd.", "YGDDDDII", "Y.ddddd."],
    },
  },
  "blossom-blade": {
    stand: {
      x: 18,
      y: 3,
      rows: ["..U..", ".URU.", "URWRU", "URWRU", "URWRU", "URWRU", "URRRU", ".UrU.", ".URU.", "URWRU", "UYRYU", "..r.."],
    },
    windup: {
      x: 18,
      y: 0,
      rows: ["..U..", ".URU.", "URWRU", "URWRU", "URWRU", "URWRU", "URRRU", ".UrU.", ".URU.", "URWRU", "UYRYU", "..r.."],
    },
    strike: {
      x: 15,
      y: 11,
      rows: ["...U....U", "URWU.UUU.", "UYrRRRWWU", "URWU.UUU.", "..U.....U"],
    },
  },
  "apprentice-wand": {
    stand: {
      x: 18,
      y: 9,
      rows: [".H.", "HhH", ".h.", ".T.", ".T."],
    },
    cast: {
      x: 19,
      y: 3,
      rows: [".H.", "HhH", ".h.", ".T.", ".T."],
    },
  },
  "starlight-wand": {
    stand: {
      x: 18,
      y: 6,
      rows: ["..E..", ".GYG.", "YYEYY", ".GYG.", "..Y..", "..V..", "..V..", "..V.."],
    },
    cast: {
      x: 18,
      y: 1,
      rows: ["..E..", ".GYG.", "YYEYY", ".GYG.", "..Y..", "..V..", "..V..", "..V.."],
    },
  },
  "tide-staff": {
    stand: {
      x: 18,
      y: 2,
      rows: [".IIII.", "IWDDWI", "ID..dI", "Id.WDI", "IDdDWI", ".IDdI.", "..IdI.", "..IDI.", "..IdI.", "..IDI.", "..IdI.", "..IdI."],
    },
    cast: {
      x: 18,
      y: 0,
      rows: [".IIII.", "IWDDWI", "ID..dI", "Id.WDI", "IDdDWI", ".IDdI.", "..IdI.", "..IDI.", "..IdI.", "..IDI.", "..IdI.", "..IdI."],
    },
  },
  "short-bow": {
    stand: {
      x: 18,
      y: 7,
      rows: ["T...", "BT..", "B.T.", "B.t.", "B.t.", "B.T.", "B.t.", "BT..", "T..."],
    },
    draw: {
      x: 13,
      y: 8,
      rows: ["......T....", ".....B.T...", "........T..", "........t..", "..B.....t..", "BttttttttTB", "...B....t..", "....B..T...", ".....BT...."],
    },
    release: {
      x: 18,
      y: 8,
      rows: [".T..", ".BT.", ".B.T", ".B.t", ".B.t", ".B.T", ".B.t", ".BT.", ".T.."],
    },
  },
  "wind-bow": {
    stand: {
      x: 18,
      y: 5,
      rows: [".L...", "LNL..", ".lN..", ".L.N.", ".L.l.", ".L.N.", ".L.l.", ".L.N.", ".lN..", "LNL..", ".L..."],
    },
    draw: {
      x: 13,
      y: 6,
      rows: ["......L....", ".....LNL...", ".....LlN...", "......L.N..", "......L.l..", "........N..", ".L......l..", "LlllllllNLL", "..L.....l..", "...L..lN...", "....LLNL..."],
    },
    release: {
      x: 18,
      y: 6,
      rows: [".L...", "LNL..", ".lN..", ".L.N.", ".L.l.", ".L.N.", ".L.l.", ".L.N.", ".lN..", "LNL..", ".L..."],
    },
  },
  "meteor-bow": {
    stand: {
      x: 18,
      y: 3,
      rows: ["..E...", ".EWE..", "EYVYE.", ".EVYVE", "..E.VE", "..E.VE", "..EYVE", "..EYVE", "..E.VE", "..E.VE", ".EVYVE", "EYVYE.", ".EEE.."],
    },
    draw: {
      x: 13,
      y: 4,
      rows: [".......E...", "......EWE..", ".....EYVYE.", "......EVYVE", "......E..VE", ".....E...VE", "........YVE", "........YVE", "..E.....EFE", "EVVVVVVYFYE", "...E..EVFVE", "....EEYVYE.", ".....EEEE.."],
    },
    release: {
      x: 18,
      y: 4,
      rows: ["..E...", ".EWE..", "EYVYE.", ".EVYVE", "..E.VE", "..E.VE", "..EYVE", "..EYVE", "..E.VE", "..E.VE", ".EVYVE", "EYVYE.", ".EEE.."],
    },
  },
  "oak-staff": {
    stand: {
      x: 18,
      y: 4,
      rows: [".TTT.", "Tt.tT", "T.TtT", "T..T.", "T....", "T....", "t....", "T....", "T....", "t....", "T...."],
    },
    pray: {
      x: 18,
      y: 1,
      rows: [".TTT.", "Tt.tT", "T.TtT", "T..T.", "T....", "T....", "t....", "T....", "T....", "t....", "T...."],
    },
  },
  "radiant-staff": {
    stand: {
      x: 18,
      y: 3,
      rows: ["..E..", "Y.Y.Y", ".YEY.", "YEWEY", ".YEY.", "Y.Y.Y", "..Y..", "..G..", "..Y..", "..Y..", "..G.."],
    },
    pray: {
      x: 18,
      y: 0,
      rows: ["..E..", "Y.Y.Y", ".YEY.", "YEWEY", ".YEY.", "Y.Y.Y", "..Y..", "..G..", "..Y..", "..Y..", "..G.."],
    },
  },
  "angel-scepter": {
    stand: {
      x: 17,
      y: 1,
      rows: ["..EEE..", ".EYYYE.", ".EY.YE.", "..EEE..", "UW.Y.WU", ".WBYBW.", "..WYW..", "..UYU..", "..UYU..", "..UYU..", "..UYU..", "..UYU..", "..UYU..", "...Y..."],
    },
    pray: {
      x: 17,
      y: 0,
      rows: ["..EEE..", ".EYYYE.", ".EY.YE.", "..EEE..", "UW.Y.WU", ".WBYBW.", "..WYW..", "..UYU..", "..UYU..", "..UYU..", "..UYU..", "..UYU..", "..UYU..", "...Y..."],
    },
  },
  "pencil": {
    stand: {
      x: 18,
      y: 6,
      rows: [".P.", "PPP", "YYY", "YYY", "YYY", "YYY", "TTT", ".T."],
    },
    poke: {
      x: 15,
      y: 12,
      rows: ["PPYYYYTT.", "PPYYYYYTT", "PPYYYYTT."],
    },
  },
  "fountain-pen": {
    stand: {
      x: 18,
      y: 5,
      rows: [".V.", "VVY", "VVY", "VVY", "VVV", "VVV", "YYY", "GEG", ".Y.", "...", ".d."],
    },
    poke: {
      x: 15,
      y: 12,
      rows: ["VVVYYYGG.", "VVVVYGEGY", "VVVYYYGG.", "........d"],
    },
  },
  "victory-quill": {
    stand: {
      x: 18,
      y: 3,
      rows: ["...II.", "..IWWI", ".IWYWI", "IWBEWI", "IWYWBI", "IWBEWI", ".IYBI.", ".IYI..", ".IYI..", ".IYI..", ".IYI..", "..Y..."],
    },
    poke: {
      x: 14,
      y: 11,
      rows: ["....II....", ".IIIWWIIII", "IWWYEYYYYI", ".IBWIIIIII", "..II......"],
    },
  },
  "recorder": {
    stand: {
      x: 18,
      y: 6,
      rows: [".B.", "BbB", "BKB", "BbB", "BKB", "BbB", "BKB", "BbB", "BBB"],
    },
    play: {
      x: 17,
      y: 11,
      rows: [".B.....", "bBB....", ".BKB...", "..BbB..", "...BKB.", "....BBB"],
    },
  },
  "guitar": {
    stand: {
      x: 17,
      y: 3,
      rows: ["....YY.", "....tY.", "....tY.", "....tY.", "....tY.", "....tY.", "...tYT.", "..TYYt.", "...TKt.", "..TYKTt", ".TYYTTt", "..tYtt.", "...t..."],
    },
    play: {
      x: 14,
      y: 7,
      rows: ["........YY", ".......tY.", "......tY..", ".....tY...", "....tY....", "..TTYT....", ".TYYTt....", "TYKKTTt...", ".TYYTt....", "..ttt....."],
    },
  },
  "grand-harp": {
    stand: {
      x: 16,
      y: 4,
      rows: [".....EE.", "....EYYE", "...EYYYE", "..EYR.YE", "..EYU.YE", "..EYR.YE", "..EYU.YE", "..EYD.YE", ".EY.R.YE", "EY.UR.YE", "EY.DR.YE", "EYYYYYYE", ".EEEEEE."],
    },
    play: {
      x: 14,
      y: 7,
      rows: ["......EEE.", ".....EYYYE", "....EY.RYE", "....EY.UYE", "....EY.DYE", "...EY.R.YE", "..EY.RU.YE", ".EY.RUD.YE", "EYYYYYYYYE", ".EEEEEEEE."],
    },
  },
  "zip-blade": {
    stand: {
      x: 20,
      y: 4,
      rows: [".KK.", "KMMK", "KmWK", "KMMK", "KmWK", "KMMK", "KmWK", "KMMK", "KddK", "KDDK", ".KK."],
    },
    windup: {
      x: 20,
      y: 0,
      rows: [".KK.", "KMMK", "KmWK", "KMMK", "KmWK", "KMMK", "KmWK", "KMMK", "KddK", "KDDK", ".KK."],
    },
    strike: {
      x: 16,
      y: 12,
      rows: ["K.KKKKK.", "KDMMWMMK", "K.KKKKK."],
    },
  },
  "hour-blade": {
    stand: {
      x: 18,
      y: 1,
      rows: ["..EEE.", ".EEKEE", "EEKYKE", "EKYEKE", "EKYGKE", "EKYEKE", "EKYGKE", "EKYEKE", "EKYYKE", "EKYYKE", "EKhHKE", "EEhKEE", ".EKKE.", ".EEEE."],
    },
    windup: {
      x: 18,
      y: 0,
      rows: ["..EEE.", ".EEKEE", "EEKYKE", "EKYEKE", "EKYGKE", "EKYEKE", "EKYGKE", "EKYEKE", "EKYYKE", "EKYYKE", "EKhHKE", "EEhKEE", ".EKKE.", ".EEEE."],
    },
    strike: {
      x: 14,
      y: 12,
      rows: ["EEEEEEEEEE", "EKKKKKKKKE", "EKHHYYEEKE", "EKKKKKKKKE", "EEEEEEEEEE"],
    },
  },
  "dalgona-wand": {
    stand: {
      x: 19,
      y: 6,
      rows: [".KKK.", "KYEYK", "KYGYK", "KGYGK", ".KGK.", "..T..", "..t..", "..T..", "..T.."],
    },
    cast: {
      x: 19,
      y: 0,
      rows: [".KKK.", "KYEYK", "KYGYK", "KGYGK", ".KGK.", "..T..", "..t..", "..T..", "..T.."],
    },
  },
  "glasshouse-staff": {
    stand: {
      x: 18,
      y: 1,
      rows: [".LLLL.", "LLKKLL", "LKIIKL", "LKIdKL", "LKlNKL", "LKNNKL", "LKbbKL", "LKBBKL", "LLtKLL", ".LTKL.", ".LtKL.", ".LTKL.", ".LKKL.", ".LLLL."],
    },
    cast: {
      x: 18,
      y: 0,
      rows: [".LLLL.", "LLKKLL", "LKIIKL", "LKIdKL", "LKlNKL", "LKNNKL", "LKbbKL", "LKBBKL", "LLtKLL", ".LTKL.", ".LtKL.", ".LTKL.", ".LKKL.", ".LLLL."],
    },
  },
  "post-bow": {
    stand: {
      x: 19,
      y: 6,
      rows: ["KK...", "KRK..", "KBPK.", "KB.rK", "KB.rK", "KB.rK", "KBPK.", "KRK..", "KK..."],
    },
    draw: {
      x: 14,
      y: 6,
      rows: [".....KK...", "....KRRK..", ".....KBPK.", "......B.rK", "......B.rK", "......B.rK", "...B..BPK.", "KtttttRRKK", "...B..KK..", "....BB....", ".........."],
    },
    release: {
      x: 19,
      y: 6,
      rows: ["KK...", "KRK..", "KBPK.", "KB.rK", "KB.rK", "KB.rK", "KBPK.", "KRK..", "KK..."],
    },
  },
  "loom-bow": {
    stand: {
      x: 17,
      y: 2,
      rows: ["EEEE...", "EKKEE..", "EKYKEE.", "EEBbKEE", ".EB.GKE", ".EB.GKE", ".EE.GKE", ".EB.GKE", ".EB.GKE", ".EBbKEE", "EEYbKE.", "EKYKEE.", "EEEEE.."],
    },
    draw: {
      x: 14,
      y: 4,
      rows: [".....EEEE.", "....EEKKEE", "....EKYYKE", "....EEbbKE", ".....EEGKE", ".....EBGKE", ".....EEGKE", "....EEBGKE", "..EEEKEGKE", "EEEKKYbbKE", "EKYYYYYYKE", "EEEKKYGGKE", "..EEEEEEEE"],
    },
    release: {
      x: 17,
      y: 2,
      rows: ["EEEE...", "EKKEE..", "EKYKEE.", "EEBbKEE", ".EB.GKE", ".EB.GKE", ".EE.GKE", ".EB.GKE", ".EB.GKE", ".EBbKEE", "EEYbKE.", "EKYKEE.", "EEEEE.."],
    },
  },
  "lucky-key": {
    stand: {
      x: 19,
      y: 6,
      rows: [".KKK.", "KY.YK", "KYEYK", ".KGK.", "..YK.", "..GK.", "..YYK", "..YGK", "..KK."],
    },
    pray: {
      x: 19,
      y: 0,
      rows: [".KKK.", "KY.YK", "KYEYK", ".KGK.", "..YK.", "..GK.", "..YYK", "..YGK", "..KK."],
    },
  },
  "promise-compass": {
    stand: {
      x: 18,
      y: 1,
      rows: [".IIII.", "IIKKII", "IKDdKI", "IKIFKI", "IKFYKI", "IKdDKI", "IIKKII", ".IITKI", "..ItKI", "..ITKI", "..ItKI", "..ITKI", "..IKKI", "..IIII"],
    },
    pray: {
      x: 18,
      y: 0,
      rows: [".IIII.", "IIKKII", "IKDdKI", "IKIFKI", "IKFYKI", "IKdDKI", "IIKKII", ".IITKI", "..ItKI", "..ITKI", "..ItKI", "..ITKI", "..IKKI", "..IIII"],
    },
  },
  "correction-pen": {
    stand: {
      x: 20,
      y: 6,
      rows: [".KK.", "KDDK", "KIWK", "KDdK", "KDdK", "KBBK", "KBbK", "KBBK", ".KK."],
    },
    poke: {
      x: 15,
      y: 12,
      rows: ["KKKKKKKK.", "KDDDBBBmK", "KKKKKKKK."],
    },
  },
  "drafting-pen": {
    stand: {
      x: 18,
      y: 3,
      rows: [".IIII.", "IIKKII", "IKDDKI", "IKIdKI", "IKDdKI", "IKDdKI", "IKDDKI", "IKYEKI", "IKMmKI", "IImKII", ".IKKI.", ".IIII."],
    },
    poke: {
      x: 14,
      y: 12,
      rows: ["IIIIIIIIII", "IKDDDYMmKI", "IIIIIIIIII"],
    },
  },
  "castanets": {
    stand: {
      x: 18,
      y: 5,
      rows: [".KKKK.", "KFTTfK", "KFWFfK", "KFTTfK", ".KKKK.", "..KK..", ".KFFK.", "KFTTfK", "KFTTfK", ".KKKK."],
    },
    play: {
      x: 17,
      y: 12,
      rows: [".KK.KK.", "KFWKFFK", "KFTKFTK", ".KK.KK."],
    },
  },
  "campus-xylophone": {
    stand: {
      x: 18,
      y: 1,
      rows: [".IIII.", "IIKKII", "IKRRKI", "IKrRKI", "IKFFKI", "IKfFKI", "IKYYKI", "IKGYKI", "IKNNKI", "IKlNKI", "IKDDKI", "IKdDKI", "IIKKII", ".IIII."],
    },
    play: {
      x: 13,
      y: 12,
      rows: ["IIIIIIIIIII", "IKKKKKKKKKI", "IKRFYNDDBKI", "IKrfGlddbKI", "IIIIIIIIIII"],
    },
  },
};

export const WEAPON_SPRITES = Object.fromEntries(
  WEAPON_IDS.map((id) => [id, { ...FAMILY_SPRITES[WEAPONS[id].family], ...DRAWN[id] }]),
) as Record<WeaponId, Partial<Record<WeaponPose, Stamp>>>;

// 동작 프레임 → 그 계열이 쓰는 자세. 달리기(runA·runB)는 서 있는 자세로 들고 뛴다
export function poseOf(family: WeaponFamily, frame: string): WeaponPose | null {
  const pose = (frame === "runA" || frame === "runB" ? "stand" : frame) as WeaponPose;
  return FAMILY_POSES[family].includes(pose) ? pose : null;
}
