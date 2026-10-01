import { notFound } from "next/navigation";
import { ReportInfo } from "../../../components/ReportInfo.tsx";
import { BackLink } from "../../../components/BackLink.tsx";
import { Comments } from "../../../components/Comments.tsx";
import { DetailActions } from "../../../components/DetailActions.tsx";
import { ExternalIcon } from "../../../components/Icons.tsx";
import { getPastRounds, getPrograms, getSchools, getSourceNames } from "../../../lib/data.ts";
import { describeTarget, formatDate, formatPeriod } from "../../../lib/filter.ts";
import type { Program } from "../../../src/types.ts";

export const dynamicParams = false;

// 지난 회차의 연도: 모집 시작 → 게시일 → 활동 시작
const roundYear = (p: Program) =>
  Number((p.recruitPeriod.start ?? p.postedAt ?? p.activityPeriod.start ?? p.collectedAt).slice(0, 4));

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

// 원문 버튼: http(s) 주소만, 출처마다 하나씩 (재게시를 합친 공고는 가장 최근 글이 앞에 있다)
function applyLinks(program: Program) {
  const safe = program.links.filter((link) => /^https?:\/\//.test(link.url));
  return safe.filter((link, index) => safe.findIndex((l) => l.sourceId === link.sourceId) === index);
}

const HISTORY_SHOWN = 8; // 지난 공고는 최근 몇 개만 먼저 보여 주고 나머지는 접어 둔다

function historyRow(round: Program) {
  const year = roundYear(round);
  const recruitText = formatPeriod(round.recruitPeriod, year);
  const period = recruitText
    ? `모집 ${recruitText}`
    : round.postedAt && `게시 ${formatDate(round.postedAt, year)}`;
  return (
    <li key={round.id}>
      <a href={round.links[0].url} target="_blank" rel="noopener noreferrer">
        <span className="history-year">{year}</span>
        <span className="history-body">
          <span className="history-title">{round.title}</span>
          {period && <span className="history-period">{period}</span>}
        </span>
        <ExternalIcon size={16} />
      </a>
    </li>
  );
}

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const program = getPrograms().find((p) => p.id === id);
  if (!program) notFound();

  const pastRounds = getPastRounds(program);
  const links = applyLinks(program);
  const sourceNames = getSourceNames();
  const schoolNames = Object.fromEntries(getSchools().map((school) => [school.id, school.name]));
  const year = new Date().getFullYear();
  const recruit = formatPeriod(program.recruitPeriod, year);
  const activity = formatPeriod(program.activityPeriod, year);
  const targetText = describeTarget(program, schoolNames);

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
      <ReportInfo programId={program.id} />
      {program.target.openTo && (
        <p className="notice">
          게시한 학교가 아니어도 지원할 수 있다고 AI가 판단한 공고예요({program.target.openTo}). 지역·학년 같은 조건이 있을 수 있으니
          원문에서 꼭 확인해 주세요.
        </p>
      )}

      {pastRounds.length > 0 && (
        <section className="card history">
          <h2 className="card-title">지난 공고</h2>
          <p className="card-sub">해마다 열리는 프로그램이에요. 지난 회차 일정을 보면 준비 시기를 가늠할 수 있어요.</p>
          <ul className="history-list">{pastRounds.slice(0, HISTORY_SHOWN).map(historyRow)}</ul>
          {pastRounds.length > HISTORY_SHOWN && (
            <details className="history-more">
              <summary>지난 공고 {pastRounds.length - HISTORY_SHOWN}개 더 보기</summary>
              <ul className="history-list">{pastRounds.slice(HISTORY_SHOWN).map(historyRow)}</ul>
            </details>
          )}
        </section>
      )}

      {program.seriesId && <Comments seriesId={program.seriesId} />}

      <div className="cta">
        {links.map((link, index) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`button ${index === 0 ? "primary" : ""} wide`}
          >
            {links.length > 1 ? `${sourceNames[link.sourceId] ?? link.sourceId}에서 보기` : "원문에서 신청하기"}
            <ExternalIcon />
          </a>
        ))}
        <p className="cta-note">신청과 자세한 내용은 원래 사이트에서 확인하세요.</p>
      </div>
    </article>
  );
}
