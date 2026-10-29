import { getPrograms } from "../../../lib/data.ts";
import { formatPeriod, recruitWord } from "../../../lib/filter.ts";
import { OG_SIZE, renderCard } from "../../../lib/og.tsx";

// 공고마다 공유 미리보기 이미지: 학교 배지, 제목, 모집 기간, 주최
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "공고 미리보기";

// 상세 화면처럼 배포 때 미리 만들지 않고 처음 요청될 때 만든다 (app/programs/[id]/page.tsx)
export function generateStaticParams() {
  return [];
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const program = getPrograms().find((p) => p.id === id);
  if (!program) return new Response("없는 공고", { status: 404 });
  const year = new Date().getFullYear();
  const recruit = formatPeriod(program.recruitPeriod, year);
  const activity = formatPeriod(program.activityPeriod, year);
  const when = recruit
    ? `${recruitWord(program)} ${recruit}`
    : program.noApplication
      ? `신청 없이 참여${activity ? ` · ${activity}` : ""}`
      : `${recruitWord(program)} 일정은 원문 확인`;
  return renderCard({
    badges: [...program.schoolLabels, ...(program.target.openTo ? ["다른 학교도 지원"] : [])],
    title: program.title,
    lines: [when, program.organizer ?? ""].filter(Boolean),
  });
}
