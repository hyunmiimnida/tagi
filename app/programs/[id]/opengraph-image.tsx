import { getPrograms } from "../../../lib/data.ts";
import { formatPeriod } from "../../../lib/filter.ts";
import { OG_SIZE, renderCard } from "../../../lib/og.tsx";

// 공고마다 공유 미리보기 이미지: 학교 배지, 제목, 모집 기간, 주최
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "공고 미리보기";

export function generateStaticParams() {
  return getPrograms().map((program) => ({ id: program.id }));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const program = getPrograms().find((p) => p.id === id)!;
  const year = new Date().getFullYear();
  const recruit = formatPeriod(program.recruitPeriod, year);
  const activity = formatPeriod(program.activityPeriod, year);
  const when = recruit
    ? `모집 ${recruit}`
    : program.noApplication
      ? `신청 없이 참여${activity ? ` · ${activity}` : ""}`
      : "모집 일정은 원문 확인";
  return renderCard({
    badges: [...program.schoolLabels, ...(program.target.openTo ? ["다른 학교도 지원"] : [])],
    title: program.title,
    lines: [when, program.organizer ?? ""].filter(Boolean),
  });
}
