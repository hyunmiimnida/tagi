import { SITE_URL } from "./filter.ts";
import type { Program } from "../src/types.ts";

// 공고 상세의 검색엔진용 구조화 데이터(JSON-LD, schema.org).
// - 활동 시작일을 알면 Event(행사): 활동 기간 = startDate·endDate, 모집 기간 = 신청 창구(offers)의 validFrom·validThrough
// - 활동 시작일을 모르면 CreativeWork(공고문): 게시일 = datePublished, 모집 마감 = expires
// 모르는 날짜·주최는 칸을 빼고, 추측해서 채우지 않는다

type JsonLd = Record<string, unknown>;

const organization = (name: string | null) => (name ? { "@type": "Organization", name } : undefined);

// 값이 없는(undefined·null·빈 목록) 칸을 지운다
function clean(value: JsonLd): JsonLd {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)),
  );
}

export function programJsonLd(program: Program): JsonLd {
  const originals = program.links.map((link) => link.url).filter((url) => /^https?:\/\//.test(url));
  const common = {
    "@context": "https://schema.org",
    name: program.title,
    description: program.summary ?? undefined,
    url: `${SITE_URL}/programs/${encodeURIComponent(program.id)}`,
    sameAs: [...new Set(originals)], // 원문 주소
    keywords: program.tags.length > 0 ? program.tags.join(", ") : undefined,
  };
  const { recruitPeriod: recruit, activityPeriod: activity } = program;

  if (activity.start) {
    const offer =
      recruit.start || recruit.end
        ? clean({ "@type": "Offer", url: originals[0], validFrom: recruit.start, validThrough: recruit.end })
        : undefined;
    return clean({
      ...common,
      "@type": "Event",
      startDate: activity.start,
      endDate: activity.end ?? undefined,
      organizer: organization(program.organizer),
      offers: offer,
    });
  }

  return clean({
    ...common,
    "@type": "CreativeWork",
    datePublished: program.postedAt ?? undefined,
    expires: recruit.end ?? undefined,
    sourceOrganization: organization(program.organizer),
  });
}

// <script> 안에 넣을 문자열. 제목에 "</script>"가 들어 있어도 태그가 끊기지 않게 < > &를 바꾼다
export function jsonLdScript(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
