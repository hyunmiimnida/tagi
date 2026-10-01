import { notFound } from "next/navigation";
import { BackLink } from "../../../components/BackLink.tsx";
import { DetailActions } from "../../../components/DetailActions.tsx";
import { ExternalIcon } from "../../../components/Icons.tsx";
import { getPrograms, getSchools, getSourceNames } from "../../../lib/data.ts";
import { formatPeriod } from "../../../lib/filter.ts";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPrograms().map((program) => ({ id: program.id }));
}

// 링크를 공유했을 때 보이는 제목과 설명
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const program = getPrograms().find((p) => p.id === id);
  if (!program) return {};
  const recruit = formatPeriod(program.recruitPeriod, new Date().getFullYear());
  const description = [program.organizer, recruit && `모집 ${recruit}`, program.tags.map((t) => `#${t}`).join(" ")]
    .filter(Boolean)
    .join(" · ");
  return { title: program.title, description, openGraph: { title: program.title, description } };
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
  const restrictions = [target.colleges, target.departments, target.grades].filter((list) => list.length > 0);
  const targetText = [
    target.schools.map((schoolId) => schoolNames[schoolId] ?? schoolId).join(", ") || "모든 학교",
    ...restrictions.map((list) => list.join(", ")),
  ].join(" · ");

  const rows: [string, string | null][] = [
    ["모집 기간", recruit],
    ["활동 기간", activity],
    ["모집 대상", targetText],
    ["주최", program.organizer && `${program.organizer}${program.organizerType ? ` (${program.organizerType})` : ""}`],
    ["출처", program.sources.map((sourceId) => sourceNames[sourceId] ?? sourceId).join(", ")],
  ];

  return (
    <article className="detail">
      <BackLink />

      <header className="detail-head">
        <p className="detail-org">{program.organizer ?? "주최 미확인"}</p>
        <h1>{program.title}</h1>
        {program.tags.length > 0 && (
          <div className="row-tags">
            {program.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
      </header>

      <DetailActions program={program} />

      <section className="card info-card">
        <dl>
          {rows.map(([label, value]) => (
            <div key={label} className="info-row">
              <dt>{label}</dt>
              <dd className={value ? "" : "missing"}>{value ?? "원문에서 확인해 주세요"}</dd>
            </div>
          ))}
        </dl>
      </section>

      {(!recruit || !activity) && (
        <p className="notice">일부 일정은 자동으로 찾지 못했어요. 신청 전에 원문에서 꼭 확인해 주세요.</p>
      )}

      <div className="cta">
        {program.links.map((link, index) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`button ${index === 0 ? "primary" : ""} wide`}
          >
            {program.links.length > 1 ? `${sourceNames[link.sourceId] ?? link.sourceId}에서 보기` : "원문에서 신청하기"}
            <ExternalIcon />
          </a>
        ))}
        <p className="cta-note">신청과 자세한 내용은 원래 사이트에서 확인하세요.</p>
      </div>
    </article>
  );
}
