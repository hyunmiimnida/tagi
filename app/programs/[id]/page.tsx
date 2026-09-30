import { notFound } from "next/navigation";
import { BackLink } from "../../../components/BackLink.tsx";
import { DetailActions } from "../../../components/DetailActions.tsx";
import { getPrograms, getSchools, getSourceNames } from "../../../lib/data.ts";
import { formatPeriod } from "../../../lib/filter.ts";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPrograms().map((program) => ({ id: program.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: getPrograms().find((p) => p.id === id)?.title };
}

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const program = getPrograms().find((p) => p.id === id);
  if (!program) notFound();

  const sourceNames = getSourceNames();
  const schoolNames = Object.fromEntries(getSchools().map((school) => [school.id, school.name]));
  const { target } = program;
  const year = new Date().getFullYear();
  const recruit = formatPeriod(program.recruitPeriod, year);
  const activity = formatPeriod(program.activityPeriod, year);
  const targetText = [
    target.schools.map((schoolId) => schoolNames[schoolId] ?? schoolId).join(", ") || "모든 학교",
    ...[target.colleges, target.departments, target.grades].filter((list) => list.length > 0).map((list) => list.join(", ")),
  ].join(" / ");

  return (
    <article className="detail">
      <BackLink />
      <h1>{program.title}</h1>
      <DetailActions program={program} />

      <dl>
        <dt>주최 기관</dt>
        <dd>{program.organizer ?? "확인되지 않음"}</dd>
        <dt>주최 유형</dt>
        <dd>{program.organizerType ?? "확인되지 않음"}</dd>
        <dt>모집 대상</dt>
        <dd>{targetText}</dd>
        <dt>모집 기간</dt>
        <dd>{recruit ?? "원문에서 확인해 주세요"}</dd>
        <dt>활동 기간</dt>
        <dd>{activity ?? "원문에서 확인해 주세요"}</dd>
        <dt>태그</dt>
        <dd className="tags">
          {program.tags.length > 0 ? program.tags.map((tag) => <span key={tag}>#{tag}</span>) : "없음"}
        </dd>
        <dt>수집 출처</dt>
        <dd>{program.sources.map((sourceId) => sourceNames[sourceId] ?? sourceId).join(", ")}</dd>
      </dl>

      {(!recruit || !activity) && (
        <p className="notice">일부 일정을 자동으로 찾지 못했어요. 정확한 내용은 원문에서 확인해 주세요.</p>
      )}

      <h2>원문 링크</h2>
      <p className="muted small">신청과 자세한 내용은 원래 사이트에서 확인하세요.</p>
      {program.links.map((link) => (
        <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="button wide primary">
          {sourceNames[link.sourceId] ?? link.sourceId}에서 보기 ↗
        </a>
      ))}
    </article>
  );
}
