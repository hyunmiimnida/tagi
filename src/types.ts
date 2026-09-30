// 기간. 날짜는 "2026-10-01" 형식, 모르면 null
export interface Period {
  start: string | null;
  end: string | null;
}

// 공통 데이터 형식: 출처가 달라도 모든 정보를 이 틀에 담는다
export interface Program {
  id: string;
  title: string;
  organizer: string | null; // 주최 기관
  organizerType: string | null; // 주최 유형 (학교, 기업, 정부부처 등)
  target: {
    schools: string[]; // 학교 id. 비어 있으면 모든 학교 공통
    colleges: string[];
    departments: string[];
    grades: string[];
  };
  recruitPeriod: Period; // 모집 기간
  activityPeriod: Period; // 활동 기간
  tags: string[];
  links: { sourceId: string; url: string }[]; // 원문 링크 (중복 게시 시 여러 개)
  sources: string[]; // 수집 출처 id
  postedAt: string | null; // 원문 게시일
  extractedBy: "rules" | "ai"; // 정보 추출 방법
  collectedAt: string;
}

// 수집기가 돌려주는 값. text는 정보 추출에만 쓰고 저장하지 않는다
export interface CollectedItem {
  program: Program;
  writer: string | null; // 게시물 작성 부서
  text: string;
}

export interface Source {
  id: string;
  name: string;
  collector: string; // src/collectors/index.ts에 등록된 수집기 이름
  url: string;
  enabled: boolean;
  pages?: number; // 목록을 몇 쪽까지 볼지
  defaultOrganizer?: string; // 게시물에서 주최를 알 수 없을 때 쓰는 값
  useAi?: boolean; // 본문이 길어 AI 추출이 필요한 출처
}

export interface School {
  id: string;
  name: string;
  sources: Source[];
}

export interface Tag {
  name: string;
  keywords: string[];
}

export interface TagCategory {
  id: string;
  name: string;
  matchOn: "organizer" | "title"; // 키워드를 어디에서 찾을지
  tags: Tag[];
}

export interface CollectContext {
  school: School;
  source: Source;
  fetchHtml: (url: string) => Promise<string>;
  isKnown: (url: string) => boolean; // 이미 저장된 게시물인지
}

export type Collector = (ctx: CollectContext) => Promise<CollectedItem[]>;

export function emptyProgram(school: School, source: Source, postId: string, title: string, url: string): Program {
  return {
    id: `${source.id}-${postId}`,
    title,
    organizer: null,
    organizerType: null,
    target: { schools: [school.id], colleges: [], departments: [], grades: [] },
    recruitPeriod: { start: null, end: null },
    activityPeriod: { start: null, end: null },
    tags: [],
    links: [{ sourceId: source.id, url }],
    sources: [source.id],
    postedAt: null,
    extractedBy: "rules",
    collectedAt: new Date().toISOString(),
  };
}
