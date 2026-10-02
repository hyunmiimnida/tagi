// 모집 대상의 학년과 신분. 필터와 AI 추출이 같은 이름을 쓴다
export const GRADES = ["1학년", "2학년", "3학년", "4학년"];
export const STUDENT_STATUSES = ["재학생", "휴학생", "졸업생"];

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
    grades: string[]; // "1학년"~"4학년". 비어 있으면 학년 제한 없음
    statuses?: string[]; // 참여할 수 있는 신분 (재학생·휴학생·졸업생). 비어 있으면 제한 없음
    excludedStatuses?: string[]; // 공고에서 명시적으로 뺀 신분 (예: 휴학생 제외)
    // 게시한 학교 학생이 아니어도 지원할 수 있을 때 그 대상 (예: "전국 대학생", "만 19~34세 청년").
    // null = 게시한 학교 학생 대상이거나 알 수 없음, 없음(undefined) = 아직 확인하지 않음
    openTo?: string | null;
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
  aliases?: string[]; // 이 공고에 합쳐져 없어진 공고 id (예전 주소를 이 공고로 연결한다)
  // 무엇을 하는(받는) 기회인지 AI가 쓴 한 문장 요약. null = 알 수 없음, 없음(undefined) = 아직 묻지 않음
  summary?: string | null;
  // 사전 신청 없이 기간 중에 참여·이용하는 행사·서비스(박람회, 상설 상담실 등)인지 AI가 판단. 없음(undefined) = 아직 묻지 않음
  noApplication?: boolean;
  seriesId?: string; // 해마다·학기마다 반복되는 같은 프로그램의 묶음 id (src/series.ts)
}

// 수집기가 돌려주는 값. text는 정보 추출에만 쓰고 저장하지 않는다
export interface CollectedItem {
  program: Program;
  writer: string | null; // 게시물 작성 부서
  text: string;
  images?: string[]; // 본문 그림 주소 (본문 글자가 거의 없으면 AI가 포스터 글자를 읽는다). 저장하지 않는다
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
  board?: TableBoard; // "table-board" 수집기의 사이트별 설정
}

// 표 모양 게시판(번호·제목·작성자·등록일) 설정. 학교마다 다른 부분만 적는다
export interface TableBoard {
  link: string; // 목록에서 게시물 링크 선택자 (예: "td.subject a")
  idParam?: string; // 링크 주소에서 게시물 번호가 담긴 칸 이름 (예: "parm_bod_uid")
  idPattern?: string; // 번호가 주소 경로에 있을 때 찾는 규칙 (예: "/(\d+)/artclView")
  viewUrl: string; // 상세 주소. {id} 자리에 게시물 번호가 들어간다
  pageParam: string; // 목록 쪽 번호 칸 이름 (1쪽부터)
  title: string; // 상세에서 제목 선택자
  content: string; // 상세에서 본문 선택자
  listDate?: string; // 목록에서 등록일 칸 선택자 (기본: "td.date")
  date?: string; // 상세에서 등록일 선택자 (기본: "등록일·일시" 이름표 옆 값)
  writer?: string; // 상세에서 작성 부서 선택자 (기본: "작성자·부서" 이름표 옆 값). "작성자 :" 같은 머리말은 지운다
  // 쪽 번호·게시물 번호를 base64로 감싼 주소 칸에 넣는 게시판 (예: 대구가톨릭대 mv_data).
  // list는 목록 칸 값({page} 자리에 쪽 번호), view는 상세 칸 값({id} 자리에 게시물 번호). 이때 idPattern은 풀어 낸 값에서 번호를 찾고,
  // viewUrl의 {id} 자리에는 감싼 view 값이 들어간다
  encoded?: { param: string; list: string; view: string };
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
    target: { schools: [school.id], colleges: [], departments: [], grades: [], statuses: [], excludedStatuses: [] },
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
