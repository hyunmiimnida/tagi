// 리서치(관리자 화면 "리서치" 탭)에서 함께 쓰는 규칙과 계산. 서버를 부르지 않는 순수 계산이라 자동 검사한다.
// 서버 쪽은 supabase/research-data.sql, 이용 기록 보내기는 lib/analytics.ts, A/B 배정은 lib/experiments.ts

// 보낼 수 있는 기록 이름 (research-data.sql의 analytics_names()와 같아야 한다)
export const EVENT_NAMES = [
  "page_view",
  "program_open",
  "filter_change",
  "search",
  "favorite_on",
  "apply_click",
  "login_start",
  "login_done",
  "review_start",
  "review_submit",
  "draw",
  "click",
  "exposure",
  "survey_view",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export const EVENT_LABELS: Record<EventName, string> = {
  page_view: "화면 열기",
  program_open: "공고 상세 열기",
  filter_change: "필터 바꾸기",
  search: "검색",
  favorite_on: "관심 표시",
  apply_click: "원문(신청) 누르기",
  login_start: "로그인 시작",
  login_done: "로그인 완료",
  review_start: "후기 쓰기 시작",
  review_submit: "후기 올리기",
  draw: "뽑기",
  click: "누르기(히트맵)",
  exposure: "실험 노출",
  survey_view: "설문 보기",
};

// 히트맵을 모으는 화면. 공고 상세는 공고마다 주소가 달라 하나로 묶는다
export const HEATMAP_PAGES = ["/", "/programs", "/programs/*"] as const;
export type HeatmapPage = (typeof HEATMAP_PAGES)[number];
export function heatmapPage(pathname: string): HeatmapPage | null {
  if (pathname === "/" || pathname === "/programs") return pathname;
  if (/^\/programs\/[^/]+$/.test(pathname)) return "/programs/*";
  return null;
}

// ───────── 퍼널 ─────────
export interface FunnelStep {
  name: EventName;
  path?: string; // 있으면 그 주소에서 남긴 기록만 (page_view에 쓴다)
}

export const DEFAULT_FUNNELS: { id: string; label: string; steps: FunnelStep[] }[] = [
  { id: "explore", label: "공고 탐색 → 신청", steps: [{ name: "page_view", path: "/programs" }, { name: "program_open" }, { name: "apply_click" }] },
  { id: "favorite", label: "공고 → 관심 → 신청", steps: [{ name: "program_open" }, { name: "favorite_on" }, { name: "apply_click" }] },
  { id: "signup", label: "가입", steps: [{ name: "page_view" }, { name: "login_start" }, { name: "login_done" }] },
  { id: "review", label: "후기 쓰기", steps: [{ name: "program_open" }, { name: "review_start" }, { name: "review_submit" }] },
];

export interface FunnelRow {
  name: string;
  path: string | null;
  people: number;
  fromStart: number | null; // 첫 단계 대비 % (첫 단계가 0이면 null)
  fromPrev: number | null; // 바로 앞 단계 대비 %
  dropped: number; // 앞 단계에서 이 단계로 오지 않은 수
}

export function funnelRows(steps: { name: string; path: string | null; people: number }[]): FunnelRow[] {
  const first = steps[0]?.people ?? 0;
  return steps.map((step, i) => {
    const prev = i === 0 ? step.people : steps[i - 1].people;
    return {
      ...step,
      fromStart: first ? (step.people / first) * 100 : null,
      fromPrev: i === 0 ? (first ? 100 : null) : prev ? (step.people / prev) * 100 : null,
      dropped: i === 0 ? 0 : Math.max(0, prev - step.people),
    };
  });
}

// ───────── A/B 테스트 ─────────
export interface Variant {
  name: string;
  weight: number;
}

// 같은 기기·같은 실험이면 늘 같은 변형 (FNV-1a 해시 → 0~1)
export function hashToUnit(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 2 ** 32;
}

export function assignVariant(anonId: string, experimentId: string, variants: Variant[]): string | null {
  const usable = variants.filter((v) => v.name && v.weight > 0);
  const total = usable.reduce((n, v) => n + v.weight, 0);
  if (!total) return null;
  let point = hashToUnit(`${experimentId}:${anonId}`) * total;
  for (const v of usable) {
    if (point < v.weight) return v.name;
    point -= v.weight;
  }
  return usable[usable.length - 1].name;
}

// "a:50, b:50" → [{name, weight}]
export function parseVariants(text: string): Variant[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, weight] = part.split(":").map((s) => s.trim());
      return { name, weight: weight === undefined ? 1 : Number(weight) };
    });
}

// 두 비율 검정: 첫 변형(기준) 대비 다른 변형의 목표 달성률 차이와 우연일 확률(p, 양쪽)
export interface VariantResult {
  variant: string;
  exposed: number;
  converted: number;
}

export interface Comparison extends VariantResult {
  rate: number | null; // %
  diff: number | null; // 기준 대비 %p
  p: number | null;
  verdict: "baseline" | "early" | "same" | "better" | "worse";
}

export const MIN_EXPOSED = 100; // 변형마다 이보다 적게 노출되면 "아직 판단하기 일러요"
export const MIN_CONVERTED = 10;

export function compareVariants(results: VariantResult[]): Comparison[] {
  const [base] = results;
  return results.map((r, i) => {
    const rate = r.exposed ? (r.converted / r.exposed) * 100 : null;
    if (i === 0) return { ...r, rate, diff: null, p: null, verdict: "baseline" };
    const early =
      r.exposed < MIN_EXPOSED || base.exposed < MIN_EXPOSED || r.converted + base.converted < MIN_CONVERTED;
    const p = twoProportionP(base.converted, base.exposed, r.converted, r.exposed);
    const baseRate = base.exposed ? (base.converted / base.exposed) * 100 : null;
    const diff = rate !== null && baseRate !== null ? rate - baseRate : null;
    const verdict = early || p === null ? "early" : p >= 0.05 ? "same" : (diff ?? 0) > 0 ? "better" : "worse";
    return { ...r, rate, diff, p, verdict };
  });
}

export function twoProportionP(x1: number, n1: number, x2: number, n2: number): number | null {
  if (!n1 || !n2) return null;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (!se) return 1;
  const z = Math.abs(x1 / n1 - x2 / n2) / se;
  return 2 * (1 - normalCdf(z));
}

// 표준정규분포 누적확률 (Abramowitz–Stegun 근사, 오차 1e-7 수준)
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - tail : tail;
}

// ───────── 설문 ─────────
export type QuestionType = "choice" | "multi" | "rating" | "text";
export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  options?: string[]; // choice·multi
}
export type Answers = Record<string, string | string[] | number>;

export interface Survey {
  id: number;
  title: string;
  questions: Question[];
  audience: "all" | "login" | "school";
  school_id: string | null;
}

export const QUESTION_TYPES: Record<QuestionType, string> = { choice: "하나 고르기", multi: "여러 개 고르기", rating: "별점 (1~5)", text: "직접 쓰기" };

// 관리자가 만든 질문 목록이 쓸 만한지 (문제가 있으면 안내 문장)
export function questionProblem(questions: Question[]): string | null {
  if (questions.length === 0) return "질문을 하나 이상 넣어 주세요.";
  if (questions.length > 10) return "질문은 10개까지예요.";
  for (const [i, q] of questions.entries()) {
    if (!q.title.trim()) return `${i + 1}번 질문의 내용을 적어 주세요.`;
    if ((q.type === "choice" || q.type === "multi") && (q.options ?? []).filter((o) => o.trim()).length < 2) {
      return `${i + 1}번 질문의 보기를 두 개 이상 적어 주세요.`;
    }
  }
  return null;
}

// 답이 다 찼는지 (주관식은 비워도 된다)
export function answersComplete(questions: Question[], answers: Answers): boolean {
  return questions.every((q) => {
    const a = answers[q.id];
    if (q.type === "text") return true;
    if (q.type === "multi") return Array.isArray(a) && a.length > 0;
    if (q.type === "rating") return typeof a === "number" && a >= 1 && a <= 5;
    return typeof a === "string" && a.length > 0;
  });
}

// 이 사람에게 설문을 보여 줄지
export function surveyFor(survey: Survey, me: { signedIn: boolean; schoolId: string | null }, hidden: ReadonlySet<number>): boolean {
  if (hidden.has(survey.id)) return false;
  if (survey.audience === "login") return me.signedIn;
  if (survey.audience === "school") return me.signedIn && Boolean(me.schoolId) && me.schoolId === survey.school_id;
  return true;
}

export interface QuestionSummary {
  question: Question;
  answered: number;
  counts?: [string, number][]; // choice·multi: 보기마다 고른 수 (보기 순서)
  average?: number | null; // rating
  ratings?: number[]; // rating: 1~5점 각각 몇 명
  texts?: string[]; // text: 빈 답은 뺀다
}

export function summarizeSurvey(questions: Question[], responses: Answers[]): QuestionSummary[] {
  return questions.map((question) => {
    const values = responses.map((r) => r[question.id]).filter((v) => v !== undefined && v !== null && v !== "");
    if (question.type === "choice" || question.type === "multi") {
      const picks = values.flatMap((v) => (Array.isArray(v) ? v : [String(v)]));
      return { question, answered: values.length, counts: (question.options ?? []).map((o) => [o, picks.filter((p) => p === o).length]) };
    }
    if (question.type === "rating") {
      const nums = values.map(Number).filter((n) => n >= 1 && n <= 5);
      return {
        question,
        answered: nums.length,
        average: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
        ratings: [1, 2, 3, 4, 5].map((s) => nums.filter((n) => Math.round(n) === s).length),
      };
    }
    const texts = values.map((v) => String(v).trim()).filter(Boolean);
    return { question, answered: texts.length, texts };
  });
}
