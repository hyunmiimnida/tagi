import assert from "node:assert/strict";
import test from "node:test";
import { collectTableBoard, toIsoDate, writerName } from "./table-board.ts";

test("작성자 칸에서 부서 이름만 남긴다", () => {
  assert.equal(writerName("작성자 : 진로취업지원팀"), "진로취업지원팀");
  assert.equal(writerName("작성자 [종합교원양성센터]"), "종합교원양성센터");
  assert.equal(writerName("글로컬대학30"), "글로컬대학30");
});

test("여러 모양의 등록일을 읽는다", () => {
  assert.equal(toIsoDate("2026.09.28"), "2026-09-28");
  assert.equal(toIsoDate("작성일자 2026-09-30"), "2026-09-30");
  assert.equal(toIsoDate("26-09-30"), "2026-09-30");
});

test("카드 모양 목록(row)과 onclick 속성의 번호(idAttr)도 읽는다", async () => {
  const list = `<ul><li class="card"><div class="t"><a href="#1" onclick="jf_view('000123')">제목 하나</a></div><span class="d">2026.10.01</span></li></ul>`;
  const view = `<h2>제목 하나</h2><div class="c">본문입니다</div><p class="w">2026-10-01</p>`;
  const pages: Record<string, string> = {
    "https://u.example/list?page=1": list,
    "https://u.example/list?page=2": "<ul></ul>",
    "https://u.example/view/000123": view,
  };
  const school = { id: "x", name: "예시대학교", shortName: "예시대", sources: [] };
  const source = {
    id: "x-notice", name: "공지", collector: "table-board", url: "https://u.example/list", enabled: true, pages: 2,
    board: { link: "li.card a", row: "li", idAttr: "onclick", idPattern: "jf_view\\('(\\d+)'\\)", viewUrl: "https://u.example/view/{id}",
      pageParam: "page", title: "h2", content: ".c", listDate: ".d", date: ".w" },
  };
  const items = await collectTableBoard({ school, source, fetchHtml: async (url) => pages[url] ?? "", isKnown: () => false });
  assert.equal(items.length, 1);
  assert.equal(items[0].program.title, "제목 하나");
  assert.equal(items[0].program.links[0].url, "https://u.example/view/000123");
  assert.equal(items[0].program.postedAt, "2026-10-01");
});
