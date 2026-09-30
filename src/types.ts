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
    schools: string[]; // 학교 id
    colleges: string[];
    departments: string[];
    grades: string[];
  };
  recruitPeriod: Period; // 모집 기간
  activityPeriod: Period; // 활동 기간
  tags: string[];
  links: { sourceId: string; url: string }[]; // 원문 링크 (중복 게시 시 여러 개)
  sources: string[]; // 수집 출처 id
  collectedAt: string;
}

export interface Source {
  id: string;
  name: string;
  collector: string; // src/collectors/index.ts에 등록된 수집기 이름
  url: string;
  enabled: boolean;
}

export interface School {
  id: string;
  name: string;
  sources: Source[];
}

export interface CollectContext {
  school: School;
  source: Source;
  fetchHtml: (url: string) => Promise<string>;
}

export type Collector = (ctx: CollectContext) => Promise<Program[]>;
