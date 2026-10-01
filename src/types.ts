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
  firstSeenAt?: string; // 처음 수집한 시각 (새로 올라온 항목 표시용)
  seriesId?: string; // 해마다·학기마다 반복되는 같은 프로그램의 묶음 id (src/series.ts)
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
  localOnly?: boolean; // 해외 서버에서 접속이 막혀 내 컴퓨터에서만 수집하는 출처
}

// 교내 기관(사업단 등). 주최 이름에 keywords 중 하나가 들어 있으면 그 기관으로 본다
export interface Unit {
  name: string;
  keywords: string[];
}

export interface School {
  id: string;
  name: string;
  shortName: string; // 목록에 붙는 짧은 이름 (예: 영남대)
  units?: Unit[];
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

// 과거 글 목록의 한 줄. item이 있으면 목록만으로 정보가 다 모인 것이다 (상세를 읽지 않는다)
export interface ArchivePost {
  postId: string;
  title: string;
  url: string;
  postedAt: string | null;
  item?: CollectedItem;
}

// 과거 글 수집기: since(YYYY-MM-DD) 이후 글의 목록을 훑고, 필요하면 상세를 읽는다
export interface Archiver {
  list: (ctx: CollectContext, since: string) => Promise<ArchivePost[]>;
  read?: (ctx: CollectContext, post: ArchivePost) => Promise<CollectedItem | null>;
}

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
