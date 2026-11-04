// 공고 제목 정리: 이모지·꾸밈 기호, 다시 올렸다는 표시(재게시·수정 등), 마감·상태 표시(마감·접수중·D-2·~8/7·21시 마감)를 지워
// 목록과 상세에서 깔끔하게 보이게 한다. 마감일은 모집 기간 칸과 D-day 표시에 따로 있다.
// [학생상담센터] 같은 부서 머리말, (9/17) 같은 행사 날짜, (신설 회차 추가)·(등록금 250만원 이내) 같은 내용은 남긴다.
// 수집이 끝나고 저장하기 직전에 목록·보관함 모두에 적용한다(src/collect.ts). 같은 공고를 다시 올린 글을 합칠 때는
// 원래 제목의 "재게시" 표시를 단서로 쓰므로, 수집 중에는 원래 제목을 그대로 둔다 (dedupe.ts의 repostKey도 이 함수를 거친다)

// 이모지와 꾸밈 기호 (이모지 뒤에 붙는 모양 선택자·피부색·잇는 글자 포함)
const DECORATION = /[\p{Extended_Pictographic}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}★☆♥♡♠♤♣♧◆◇■□●○◎◈▶▷◀◁►▲△▼▽※♪♬♩✔✓☞☜❗❕]/gu;

// 다시 올림·상태 표시 (괄호 안이 통째로 이것이면 괄호째 지운다)
const STATUS = String.raw`(?:재게시|재공지|재공고|재안내|재업로드|수정\s*게시|수정|장소\s*변경|일정\s*변경|마감\s*임박|조기\s*마감|마감|접수\s*중|모집\s*중|모집\s*완료|(?:기한|기간)?\s*연장\s*(?:공고)?)`;
// 마감·기한을 말하는 조각: "9/23 마감", "~9/17(목)까지", "~5/13수 15시", "오늘 마감", "조기마감 가능"
// "까지"는 앞에 날짜·시각이 있을 때만 ("(팬덤에서 여행까지)"는 내용이라 남긴다)
const DEADLINE_PART = /마감|\d[\d\s./:'’()~월일시분요월화수목금토]*까지|^\s*~\s*['’]?\d{1,4}\s*[./년]\s*\d/;
const STATUS_ONLY = new RegExp(String.raw`^\s*${STATUS}\s*!?\s*$`);
const isDropPart = (part: string) => DEADLINE_PART.test(part) || STATUS_ONLY.test(part);

// 안에 괄호 하나까지 허용: "(신청기간 연장: ~9/16(수)까지)"
const INSIDE = String.raw`(?:[^()\[\]【】]|\([^()]*\))*`;

const RULES: [RegExp, string | ((match: string, inner: string) => string)][] = [
  // 대괄호 묶음: 다시 올림·상태 표시이거나 마감·기한이 들어 있으면 통째로 지운다 ([마감] [재게시] [🚨9/8(화) 까지] [8/7(금) 까지_건축학부] [D-2])
  [new RegExp(String.raw`[\[【](${INSIDE})[\]】]`, "g"), (match, inner) =>
    isDropPart(inner) || /^\s*D\s*-\s*(?:DAY|day|\d{1,3})\s*$/i.test(inner) || /^\s*~?\s*\d{1,2}\s*[./]\s*\d{1,2}\.?\s*$/.test(inner) && inner.includes("~") ? " " : match],
  // 둥근 괄호: 쉼표로 나눠 마감·상태 조각만 지운다 ("(9/23 마감, 등록금 250만원 이내)" → "(등록금 250만원 이내)")
  [new RegExp(String.raw`\((${INSIDE})\)`, "g"), (match, inner) => {
    const parts = inner.split(/\s*,(?!\d{3})\s*|\s*\/\s*(?=~)/); // 1,000만원의 쉼표는 나누지 않는다
    const kept = parts.filter((part) => !isDropPart(part));
    if (kept.length === parts.length) return match;
    return kept.length ? `(${kept.join(", ")})` : " ";
  }],
  // D-day 표시: D-DAY, D-2
  [/\bD\s*-\s*(?:DAY|Day|day|\d{1,3})\b/g, " "],
  // 괄호 없는 마감 표시: "21시 마감", "~9/30 마감", 끝의 "-마감", "마감임박"
  [/~?\s*\d{1,2}\s*[./월]\s*\d{1,2}일?\s*(?:\([^()]*\))?\s*(?:\d{1,2}\s*시\s*)?(?:까지\s*)?마감/g, " "],
  [/\d{1,2}\s*시\s*(?:까지\s*)?마감/g, " "],
  [/\s*[-–_]\s*마감\s*$/, " "],
  [/마감\s*임박/g, " "],
  // 괄호 없는 다시 올림 표시
  [/[_\s]*(?:재게시|재공지|재공고|재업로드)/g, " "],
];

const tidy = (title: string) =>
  title
    .replace(/[(\[【]\s*[)\]】]/g, "") // 빈 괄호
    .replace(/([(\[【])\s+/g, "$1")
    .replace(/\s+([)\]】])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/_\s+/g, "_")
    .replace(/^[\s\-–_:|·,/]+|[\s\-–_:|·,/]+$/g, "");

export function cleanTitle(title: string): string {
  let result = title.replace(DECORATION, " ").replace(/#{2,}|\*{2,}|={2,}/g, " "); // "#### 안내 ####", "**추가접수**"
  for (const [rule, replacement] of RULES) result = result.replace(rule, replacement as never);
  result = tidy(result);
  // 지우고 나서 거의 남지 않으면(이모지뿐인 제목 등) 원래 제목을 쓴다
  return result.replace(/\s/g, "").length >= 4 ? result : tidy(title);
}

// 저장하기 직전에 목록·보관함의 제목을 모두 정리한다. 바뀐 제목 수를 돌려준다
export function cleanTitles(programs: { title: string }[]): number {
  let changed = 0;
  for (const program of programs) {
    const clean = cleanTitle(program.title);
    if (clean !== program.title) {
      program.title = clean;
      changed++;
    }
  }
  return changed;
}
