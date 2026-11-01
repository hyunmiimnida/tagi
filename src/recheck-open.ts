import { createHash } from "node:crypto";
import { isClosed, lastDay } from "../lib/filter.ts";
import { mergePrograms } from "./dedupe.ts";
import type { Archiver, CollectContext, CollectedItem, Program, School, Source } from "./types.ts";

export const RECHECK_LIMIT = 150;
const THREE_DAYS = 3 * 86_400_000;

export interface RecheckContext {
  schools: School[];
  archivers: Record<string, Pick<Archiver, "read">>;
  githubActions: boolean;
}

export function recheckLimit(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return RECHECK_LIMIT;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 0 ? limit : RECHECK_LIMIT;
}

// 출처 설정도 입력받아 파일이나 환경 변수를 읽지 않는다.
export function pickRecheck(programs: Program[], today: string, limit: number, context: RecheckContext): Program[] {
  const sources = new Map(context.schools.flatMap((school) => school.sources.map((source) => [source.id, source])));
  if (!Number.isSafeInteger(limit) || limit <= 0) return [];
  const now = Date.parse(today);
  if (!Number.isFinite(now)) return [];
  const checked = (p: Program) => p.checkedAt ? Date.parse(p.checkedAt) : -Infinity;
  const seen = new Set<string>();
  return programs.filter((p) => {
    const link = p.links[0];
    const source = link && sources.get(link.sourceId);
    if (!source?.enabled || !context.archivers[source.collector]?.read) return false;
    if (source.localOnly && context.githubActions) return false;
    if (p.extractedBy !== "ai" || !p.postedAt || isClosed(p, today.slice(0, 10))) return false;
    return now - checked(p) >= THREE_DAYS;
  }).sort((a, b) => {
    const x = checked(a), y = checked(b);
    return (x === y ? 0 : x < y ? -1 : 1)
      || (lastDay(a) ?? "9999-12-31").localeCompare(lastDay(b) ?? "9999-12-31");
  }).filter((p) => {
    const url = p.links[0].url;
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, limit);
}

export function createRecheckPicker(context: RecheckContext) {
  return (programs: Program[], today: string, limit: number) => pickRecheck(programs, today, limit, context);
}

export function compareContent(contentHash: string | undefined, text: string) {
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const state = contentHash === undefined ? "first" : contentHash === hash ? "same" : "changed";
  return { hash, state } as const;
}

export interface Recheck {
  saved: Program;
  item: CollectedItem;
  hash: string;
  state: "first" | "same" | "changed";
}

// JSON 상세 주소에는 합쳐진 공고 id 대신 원문 글 번호를 넣는다.
function postIdOf(program: Program, source: Source): string {
  if (!source.json?.detailUrl) return program.id;
  const [before, after] = source.json.viewUrl.split("{id}");
  const url = program.links[0].url;
  if (after === undefined || !url.startsWith(before) || !url.endsWith(after)) throw new Error("글 번호를 찾지 못함");
  const id = url.slice(before.length, after ? -after.length : undefined);
  if (!id) throw new Error("글 번호가 없음");
  return id;
}

export async function readRechecks(
  programs: Program[], today: string, limit: number, context: RecheckContext,
  fetchHtml: CollectContext["fetchHtml"],
) {
  const pickRecheck = createRecheckPicker(context);
  const selected = pickRecheck(programs, today, limit);
  const sources = new Map(context.schools.flatMap((school) => school.sources.map((source) => [source.id, { school, source }])));
  const checks: Recheck[] = [];
  let skipped = 0;
  for (const saved of selected) {
    const link = saved.links[0];
    const { school, source } = sources.get(link.sourceId)!;
    try {
      let failed = false;
      const item = await context.archivers[source.collector].read!({
        school, source, fetchHtml, isKnown: () => false,
        onPostError: () => { failed = true; },
      }, { postId: postIdOf(saved, source), title: saved.title, url: link.url, postedAt: saved.postedAt });
      if (!item || failed) { skipped++; continue; }
      item.program.id = saved.id;
      item.program.links = [link];
      item.program.postedAt ??= saved.postedAt;
      item.program.extractedBy = "rules";
      checks.push({ saved, item, ...compareContent(saved.contentHash, item.text) });
    } catch {
      skipped++;
    }
  }
  return { checks, skipped, attempted: selected.length };
}

export function finishRecheck(check: Recheck, checkedAt: string, notForStudents = false): Program {
  const { saved, item, hash, state } = check;
  if (state !== "changed") return { ...saved, contentHash: hash, checkedAt };
  if (notForStudents || item.program.extractedBy !== "ai") return { ...saved, checkedAt };
  // 첫 원문의 새 정보를 반영한 뒤 기존 주소와 묶음을 돌려놓는다.
  const [updated] = mergePrograms([{ ...saved, links: [saved.links[0]] }], [{
    ...item.program, id: saved.id, links: [saved.links[0]], contentHash: hash, checkedAt,
  }]);
  return {
    ...updated, id: saved.id, aliases: saved.aliases, seriesId: saved.seriesId,
    firstSeenAt: saved.firstSeenAt, links: saved.links, sources: saved.sources,
  };
}
