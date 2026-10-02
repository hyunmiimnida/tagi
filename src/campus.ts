import type { Program, School } from "./types.ts";

// 같은 게시판에 섞여 올라오는 다른 캠퍼스 글(한양대 ERICA, 경희대 국제캠퍼스, 중앙대 다빈치캠퍼스 등)을 가린다.
// 학교 설정의 campuses: 목록의 캠퍼스 표시(label)가 labels 중 하나와 같으면 그 캠퍼스.
// 표시가 없는 게시판(또는 이미 저장된 글)만 제목의 titleKeywords로 판단한다 (표시가 "통합"인데 제목에 캠퍼스 이름이 든 글을 잘못 옮기지 않게)
export function campusOf(school: School, title: string, label?: string): string | undefined {
  const tokens = (label ?? "").split(/[\s/,·|]+/).filter(Boolean);
  return school.campuses?.find((c) =>
    tokens.length > 0 ? c.labels?.some((l) => tokens.includes(l)) : c.titleKeywords?.some((k) => title.includes(k)),
  )?.schoolId;
}

// 공고에 캠퍼스를 정한다. 다른 학교도 지원할 수 있는 공고(openTo)는 모집 대상 학교를 비워 둔다
// 한 번 정한 캠퍼스는 지우지 않는다 (목록 표시는 처음 수집할 때만 보인다)
export function applyCampus(program: Program, school: School, label?: string): void {
  const campus = program.campus ?? campusOf(school, program.title, label);
  if (!campus) return;
  program.campus = campus;
  if (!program.target.openTo) program.target.schools = [campus];
}
