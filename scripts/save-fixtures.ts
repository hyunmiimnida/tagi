import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { collectors } from "../src/collectors/index.ts";
import { fetchHtml } from "../src/fetch.ts";
import type { School } from "../src/types.ts";

// 수집기 테스트용 HTML 샘플을 저장한다 (사이트 구조가 바뀌어 테스트가 깨지면 다시 실행해 샘플을 갱신한다).
// 샘플에는 원문 글이 들어 있어 GitHub에 올리지 않는다 (.gitignore). 새 컴퓨터에서는 한 번 실행해 만든다
//   node scripts/save-fixtures.ts [출처 id ...]
// 출처마다 목록 1쪽과 처음 상세 1개만 받는다. 스크립트·스타일·글 안 그림 데이터는 지워 파일을 작게 만든다
const ALL = ["yu-news", "yu-career", "knu-notice", "knu-startup", "kmu-notice", "kmu-col-coe", "dcu-program"];
const CASES = process.argv.length > 2 ? process.argv.slice(2) : ALL; // 출처 id를 주면 그것만 다시 저장
const OUT = new URL("../test/fixtures/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const shrink = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/src="data:[^"]*"/g, 'src=""')
    .replace(/\s+/g, " ");

const schools: School[] = JSON.parse(readFileSync(new URL("../config/schools.json", import.meta.url), "utf8"));
for (const id of CASES) {
  const school = schools.find((s) => s.sources.some((src) => src.id === id))!;
  const source = { ...school.sources.find((src) => src.id === id)!, pages: 1 };
  const pages: string[] = [];
  let details = 0;
  await collectors[source.collector]({
    school,
    source,
    // 목록 1쪽 + 상세 1개만 받는다 (그 뒤 상세는 "이미 수집함"으로 건너뜀)
    isKnown: () => details++ >= 1,
    fetchHtml: async (url) => {
      const html = await fetchHtml(url);
      pages.push(shrink(html));
      return html;
    },
  });
  writeFileSync(new URL(`${id}.json`, OUT), JSON.stringify(pages));
  console.log(id, pages.length, "쪽", Math.round(JSON.stringify(pages).length / 1024), "KB");
}
