import type { CollectedItem, Period, Program, Source, TagCategory } from "./types.ts";

// 규칙 기반 정보 추출: 제목과 본문에서 주최, 기간, 태그를 찾아 공통 데이터 형식을 채운다.
// 찾지 못한 값은 추측하지 않고 비워 둔다.

// "2026.10.1", "26.10.01", "10.1", "10월 1일" 형태. "10월 1차"처럼 날짜가 아닌 것은 제외
const NOT_DAY = String.raw`(?![\d:]|\s*[차회개명])`;
const DATE = new RegExp(
  String.raw`(?<!\d)(\d{4}|\d{2}(?=\.\d{1,2}\.\d))\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})${NOT_DAY}` +
    String.raw`|(?<![\d.])(\d{1,2})\s*[.\/월]\s*(\d{1,2})${NOT_DAY}`,
  "g",
);
const RECRUIT_LABEL = /(신청|접수|모집|지원|제출)\s*(기간|기한|마감|일정)|마감일|까지/;
const ACTIVITY_LABEL = /(운영|활동|교육|행사|진행|실시|개최|프로그램)\s*(기간|일시|일자|일정)|^[^가-힣]*(일시|일자|기간|일정)(?![가-힣])/;

const pad = (n: number) => String(n).padStart(2, "0");

// 글에서 날짜를 순서대로 찾는다. 연도가 없으면 앞 날짜나 기준 연도를 따른다
export function parseDates(text: string, baseYear: number): string[] {
  const dates: string[] = [];
  let year = baseYear;
  for (const m of text.matchAll(DATE)) {
    if (m[1]) year = Number(m[1].length === 2 ? "20" + m[1] : m[1]);
    const month = Number(m[2] ?? m[4]);
    const day = Number(m[3] ?? m[5]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    let date = `${year}-${pad(month)}-${pad(day)}`;
    // "12.20 ~ 1.10"처럼 해를 넘기는 기간
    if (!m[1] && dates.length > 0 && date < dates[dates.length - 1]) {
      date = `${++year}-${pad(month)}-${pad(day)}`;
    }
    dates.push(date);
  }
  return dates;
}

export function extractPeriods(lines: string[], baseYear: number): { recruit: Period; activity: Period } {
  const recruit: Period = { start: null, end: null };
  const activity: Period = { start: null, end: null };

  lines.forEach((line, i) => {
    const isRecruit = RECRUIT_LABEL.test(line);
    const isActivity = !isRecruit && ACTIVITY_LABEL.test(line);
    if (!isRecruit && !isActivity) return;

    // 항목 이름만 있는 줄이면 바로 아래 두 줄에서 날짜를 찾는다
    let dates = parseDates(line, baseYear);
    for (let next = 1; dates.length === 0 && line.length < 20 && next <= 2; next++) {
      dates = parseDates(lines[i + next] ?? "", baseYear);
    }
    if (dates.length === 0) return;

    if (isRecruit && !recruit.end) {
      recruit.start = dates.length > 1 ? dates[0] : null;
      recruit.end = dates[1] ?? dates[0];
    } else if (isActivity && !activity.start) {
      activity.start = dates[0];
      activity.end = dates[1] ?? dates[0];
    }
  });

  return { recruit, activity };
}

function matchTag(category: TagCategory, text: string): string[] {
  return category.tags.filter((tag) => tag.keywords.some((k) => text.includes(k))).map((tag) => tag.name);
}

export function enrich(item: CollectedItem, source: Source, categories: TagCategory[]): void {
  const { program, writer, text } = item;
  const baseYear = Number((program.postedAt ?? program.collectedAt).slice(0, 4));

  // 기간: 수집기가 이미 채운 값은 그대로 둔다
  const periods = extractPeriods([program.title, ...text.split("\n")], baseYear);
  if (!program.recruitPeriod.end) program.recruitPeriod = periods.recruit;
  if (!program.activityPeriod.start) program.activityPeriod = periods.activity;

  // 주최: 제목 앞 [대괄호]가 외부 기관이면 그 기관, 아니면 작성 부서
  const organizerCategory = categories.find((c) => c.matchOn === "organizer");
  const bracket = program.title.match(/^\s*[\[［【]([^\]］】]+)[\]］】]/)?.[1].trim();
  const bracketType = bracket && organizerCategory ? matchTag(organizerCategory, bracket)[0] : undefined;
  if (bracket && bracketType) {
    program.organizer = bracket;
    program.organizerType = bracketType;
  } else {
    program.organizer = writer ?? source.defaultOrganizer ?? null;
    // 학교 사이트의 작성 부서는 학교 소속이다
    const fallback = organizerCategory?.tags.find((t) => t.keywords.length === 0)?.name ?? null;
    program.organizerType = program.organizer ? fallback : null;
  }

  const tags = new Set<string>();
  if (program.organizerType) tags.add(program.organizerType);
  for (const category of categories) {
    if (category.matchOn === "title") matchTag(category, program.title).forEach((t) => tags.add(t));
  }
  program.tags = [...tags];
  cleanPeriods(program);
}

// 말이 안 되는 기간은 버린다 (본문에 나온 다른 날짜를 잘못 읽은 경우).
// 게시일보다 1년 넘게 앞서 시작하거나, 게시일보다 1년 반 넘게 뒤에 끝나는 기간은 모르는 값으로 둔다
const DAY = 86_400_000;
export function plausiblePeriod(period: Period, postedAt: string | null): Period {
  if (!postedAt) return period;
  const posted = Date.parse(postedAt);
  const tooEarly = period.start !== null && Date.parse(period.start) < posted - 365 * DAY;
  const tooLate = period.end !== null && Date.parse(period.end) > posted + 545 * DAY;
  return tooEarly || tooLate ? { start: null, end: null } : period;
}

// 게시일을 아는 글만 검사한다 (게시일이 없는 출처는 기간이 목록에 정리되어 있어 믿을 만하다)
export function cleanPeriods(program: Program): void {
  program.recruitPeriod = plausiblePeriod(program.recruitPeriod, program.postedAt);
  program.activityPeriod = plausiblePeriod(program.activityPeriod, program.postedAt);
}

// AI 없이 수집할 때 쓰는 거르기: 학생이 신청·참가할 것이 없는 단순 안내로 보이는 제목
// (규정 개정·의견 조회, 납부·결과 발표, 소식지, 주의 안내 등). AI가 있으면 AI가 본문을 보고 판단한다
const NOTICE_ONLY =
  /규정|지침|의견\s*(조회|수렴)|입찰|납부|합격자|결과\s*(발표|안내|공고)|선정\s*결과|뉴스레터|소식지|주의\s*안내|사칭|공사\s*안내|휴무|정전|단수/;
export const looksLikeNoticeOnly = (title: string) => NOTICE_ONLY.test(title);
