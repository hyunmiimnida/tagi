import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import type { School } from "../types.ts";
import { collectors } from "./index.ts";

// 저장해 둔 실제 HTML(test/fixtures, scripts/save-fixtures.ts로 만듦)로 수집기가 제목·날짜·본문을 제대로 읽는지 확인한다.
// 학교 사이트 구조가 바뀌면 샘플을 다시 저장하고, 이 테스트가 깨지는지 본다
// 샘플에는 원문 글이 들어 있어 GitHub에 올리지 않는다(.gitignore). 샘플이 없는 컴퓨터에서는 이 테스트를 건너뛴다
const schools: School[] = JSON.parse(readFileSync(new URL("../../config/schools.json", import.meta.url), "utf8"));

for (const id of ["yu-news", "yu-career", "knu-notice", "knu-startup", "kmu-notice", "kmu-col-coe", "dcu-program"]) {
  const file = new URL(`../../test/fixtures/${id}.json`, import.meta.url);
  const skip = existsSync(file) ? false : "샘플 없음 (node scripts/save-fixtures.ts로 만들기)";
  test(`수집기가 저장된 ${id} 페이지를 읽는다`, { skip }, async () => {
    const pages: string[] = JSON.parse(readFileSync(file, "utf8"));
    const school = schools.find((s) => s.sources.some((src) => src.id === id))!;
    const source = { ...school.sources.find((src) => src.id === id)!, pages: 1 };
    let next = 0;
    let details = 0;
    const items = await collectors[source.collector]({
      school,
      source,
      isKnown: () => details++ >= 1,
      fetchHtml: async () => pages[next++] ?? "",
    });
    assert.ok(items.length > 0, "게시물을 하나도 읽지 못함");
    const item = items[0];
    assert.ok(item.program.title.length > 3, "제목이 비었음");
    assert.ok(item.program.links[0].url.startsWith("http"), "원문 주소가 이상함");
    // 상세를 읽는 수집기는 게시일·본문도 확인한다 (목록만 읽는 취업정보는 모집 기간을 확인)
    if (source.collector === "career-program-list") {
      assert.ok(items.some((i) => i.program.recruitPeriod.end), "모집 기간을 하나도 못 읽음");
    } else {
      assert.match(item.program.postedAt ?? "", /^\d{4}-\d{2}-\d{2}$/, "게시일을 못 읽음");
      assert.ok(item.text.length > 20 || item.program.title.length > 3, "본문을 못 읽음");
    }
  });
}
