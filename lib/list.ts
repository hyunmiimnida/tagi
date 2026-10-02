import type { Period } from "../src/types.ts";
import type { ProgramView } from "./filter.ts";

// 목록 데이터 파일(public/api/list.json). 홈·공고 목록·캘린더·프로필이 함께 받아 쓴다.
// 화면마다 공고 1,000개를 HTML에 넣으면 페이지가 무거워져서, 목록에 필요한 칸만 담은 파일 하나를 한 번 받아
// 브라우저가 기억해 두고 모든 화면이 같이 쓴다 (빌드할 때 scripts/build-api.ts가 만든다).
// 빈 값(null·빈 목록·false)은 빼서 가볍게 하고, 화면에서 원래 모양(ProgramView)으로 되돌린다.

export const LIST_URL = "/api/list.json";
export const LIST_VERSION = 1;

export interface ListProgram {
  id: string;
  title: string;
  org?: string; // 주최 기관
  orgType?: string; // 주최 유형
  grades?: string[];
  statuses?: string[];
  excluded?: string[]; // 뺀 신분
  openTo?: string; // 다른 학교 학생도 지원할 수 있을 때 그 대상
  schools?: string[]; // 모집 대상 학교 id
  recruit?: [string | null, string | null]; // 모집 기간 [시작, 끝]
  activity?: [string | null, string | null]; // 활동 기간
  tags?: string[];
  posted?: string; // 원문 게시일
  seen: string; // 처음 수집한 시각
  summary?: string;
  free?: true; // 신청 없이 참여 (noApplication)
  series?: string;
  schoolIds?: string[];
  schoolLabels?: string[];
  units?: string[];
}

const list = <T>(value: T[] | undefined) => (value && value.length > 0 ? value : undefined);
const period = (p: Period): [string | null, string | null] | undefined => (p.start || p.end ? [p.start, p.end] : undefined);

// 빌드할 때: 공고 → 목록 파일 한 줄 (상세 화면에서만 쓰는 원문 링크·출처·단과대학 등은 뺀다)
export function toListProgram(p: ProgramView): ListProgram {
  const item: ListProgram = {
    id: p.id,
    title: p.title,
    org: p.organizer ?? undefined,
    orgType: p.organizerType ?? undefined,
    grades: list(p.target.grades),
    statuses: list(p.target.statuses),
    excluded: list(p.target.excludedStatuses),
    openTo: p.target.openTo || undefined,
    schools: list(p.target.schools),
    recruit: period(p.recruitPeriod),
    activity: period(p.activityPeriod),
    tags: list(p.tags),
    posted: p.postedAt ?? undefined,
    seen: p.firstSeenAt ?? p.collectedAt,
    summary: p.summary || undefined,
    free: p.noApplication ? true : undefined,
    series: p.seriesId,
    schoolIds: list(p.schoolIds),
    schoolLabels: list(p.schoolLabels),
    units: list(p.units),
  };
  // undefined 칸은 JSON에 안 들어가지만, 객체에서도 지워 둔다 (테스트에서 비교하기 쉽게)
  for (const key of Object.keys(item) as (keyof ListProgram)[]) if (item[key] === undefined) delete item[key];
  return item;
}

// 화면에서: 목록 파일 한 줄 → 공고 (목록 화면에서 쓰지 않는 칸은 빈 값)
export function fromListProgram(item: ListProgram): ProgramView {
  return {
    id: item.id,
    title: item.title,
    organizer: item.org ?? null,
    organizerType: item.orgType ?? null,
    target: {
      schools: item.schools ?? [],
      colleges: [],
      departments: [],
      grades: item.grades ?? [],
      statuses: item.statuses ?? [],
      excludedStatuses: item.excluded ?? [],
      openTo: item.openTo ?? null,
    },
    recruitPeriod: { start: item.recruit?.[0] ?? null, end: item.recruit?.[1] ?? null },
    activityPeriod: { start: item.activity?.[0] ?? null, end: item.activity?.[1] ?? null },
    tags: item.tags ?? [],
    links: [],
    sources: [],
    postedAt: item.posted ?? null,
    extractedBy: "rules",
    collectedAt: item.seen,
    firstSeenAt: item.seen,
    summary: item.summary ?? null,
    noApplication: item.free ?? false,
    seriesId: item.series,
    schoolIds: item.schoolIds ?? [],
    schoolLabels: item.schoolLabels ?? [],
    units: item.units ?? [],
  };
}
