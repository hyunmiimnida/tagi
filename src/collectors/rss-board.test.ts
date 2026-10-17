import assert from "node:assert/strict";
import test from "node:test";
import { RobotsBlockedError } from "../fetch.ts";
import type { CollectContext, RssBoard } from "../types.ts";
import { archivers, collectors } from "./index.ts";
import { archiveRssBoard, collectRssBoard } from "./rss-board.ts";

// 실제 사이트에 요청하지 않고 작은 피드로 확인한다
const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>&lt;체험 교실&gt; &amp; 모집</title>
    <link rel="self" href="/feed-entry/101"/><link rel="alternate" href="/view?board=1&amp;messageId=101"/>
    <author><name>홍길동</name></author><id>entry-101</id>
    <updated>2026-10-17T13:00:00Z</updated><published>2026-09-11T16:11:00Z</published>
    <summary type="html">&lt;p&gt;참가 &amp;amp; 신청&lt;/p&gt;&lt;img src="/poster.jpg"/&gt;</summary>
  </entry>
  <entry><title>지난 행사</title><link rel="alternate" href="/view?messageId=102"/>
    <published>2020-01-01T00:00:00Z</published><updated>2026-10-17T14:00:00Z</updated><summary>지난 본문</summary>
  </entry>
  <entry><title>새 행사</title><link href="/view?messageId=103"/>
    <updated>2026-09-12T00:00:00+09:00</updated><summary>새 본문</summary>
  </entry>
  <entry><title>날짜 없음</title><link href="/view?messageId=104"/><summary>안내</summary></entry>
</feed>`;

const rss = `<rss version="2.0"><channel><title>공지</title>
  <item><title><![CDATA[참가 &amp; 모집]]></title>
    <link>https://u.example/view?board=2&amp;messageId=201</link>
    <pubDate>Fri, 11 Sep 2026 16:11:00 GMT</pubDate><author>홍길동</author>
    <description><![CDATA[<p>첫 줄 &amp; 안내</p><p>둘째 줄</p><img src="images/poster.jpg"/><script>숨길 코드</script>]]></description>
  </item>
</channel></rss>`;

function context(feed: string, rssSettings: RssBoard = { idParam: "messageId" }) {
  const requests: string[] = [];
  const ctx: CollectContext = {
    school: { id: "x", name: "예시대학교", shortName: "예시대", region: "수도권", sources: [] },
    source: { id: "x-feed", name: "공지", collector: "rss-board", url: "https://u.example/feed", enabled: true, pages: 3, rss: rssSettings },
    isKnown: () => false,
    fetchHtml: async (url) => {
      requests.push(url);
      assert.equal(url, "https://u.example/feed", "상세 화면을 요청하면 안 됨");
      return feed;
    },
  };
  return { ctx, requests };
}

test("Atom 목록: 번호·제목·링크를 읽고 등록일을 한국 날짜로 바꾼다", async () => {
  const { ctx, requests } = context(atom);
  const posts = await archiveRssBoard.list(ctx, "2026-09-12");
  assert.deepEqual(posts.map(({ postId, title, url, postedAt }) => ({ postId, title, url, postedAt })), [
    { postId: "101", title: "<체험 교실> & 모집", url: "https://u.example/view?board=1&messageId=101", postedAt: "2026-09-12" },
    { postId: "103", title: "새 행사", url: "https://u.example/view?messageId=103", postedAt: "2026-09-12" },
  ]);
  assert.deepEqual(requests, [ctx.source.url]);
  assert.ok(!JSON.stringify(posts).includes("홍길동"));
  // 과거 글 목록을 저장했다 다시 읽어도 피드 본문이 남아 있다
  const item = await archiveRssBoard.read!(ctx, JSON.parse(JSON.stringify(posts[0])));
  assert.equal(item?.text, "참가 & 신청");
  assert.equal(item?.writer, null);
  assert.deepEqual(item?.images, ["https://u.example/poster.jpg"]);
  assert.equal(requests.length, 1);
});

test("Atom 수집: 이미 아는 글은 건너뛰고 개인 작성자 이름은 남기지 않는다", async () => {
  const { ctx, requests } = context(atom);
  ctx.isKnown = (url) => url.endsWith("messageId=102");
  const items = await collectRssBoard(ctx);
  assert.deepEqual(items.map((item) => item.program.id), ["x-feed-101", "x-feed-103", "x-feed-104"]);
  assert.equal(items[0].program.title, "<체험 교실> & 모집");
  assert.equal(items[0].program.postedAt, "2026-09-12");
  assert.equal(items[2].program.postedAt, null);
  assert.ok(items.every((item) => item.writer === null));
  assert.ok(!JSON.stringify(items).includes("홍길동"));
  assert.equal(requests.length, 1);
});

test("RSS 2.0: pubDate·description·CDATA 기호를 읽는다", async () => {
  const { ctx } = context(rss);
  const posts = await archiveRssBoard.list(ctx, "2026-09-12");
  assert.equal(posts[0].postId, "201");
  assert.equal(posts[0].title, "참가 & 모집");
  assert.equal(posts[0].url, "https://u.example/view?board=2&messageId=201");
  assert.equal(posts[0].postedAt, "2026-09-12");
  const [item] = await collectRssBoard(ctx);
  assert.equal(item.text, "첫 줄 & 안내\n둘째 줄");
  assert.deepEqual(item.images, ["https://u.example/images/poster.jpg"]);
  assert.equal(item.writer, null);
  assert.ok(!JSON.stringify({ posts, item }).includes("홍길동"));
});

test("상세 선택자가 있으면 새 글만 읽고 막힌 글은 건너뛴다", async () => {
  const { ctx, requests } = context(atom, { idParam: "messageId", content: ".content", writer: ".writer" });
  ctx.isKnown = (url) => url.endsWith("messageId=101") || url.endsWith("messageId=104");
  ctx.fetchHtml = async (url) => {
    requests.push(url);
    if (url === ctx.source.url) return atom;
    if (url.endsWith("messageId=102")) throw new RobotsBlockedError(url);
    assert.ok(url.endsWith("messageId=103"));
    return `<p class="writer">작성자 : 학생지원팀</p><div class="content"><p>상세 안내</p><img src="/full.jpg"/><style>숨길 스타일</style></div>`;
  };
  const [item, ...rest] = await collectRssBoard(ctx);
  assert.equal(rest.length, 0);
  assert.equal(item.program.id, "x-feed-103");
  assert.equal(item.writer, "학생지원팀");
  assert.equal(item.text, "상세 안내");
  assert.deepEqual(item.images, ["https://u.example/full.jpg"]);
  assert.deepEqual(requests, [ctx.source.url, "https://u.example/view?messageId=102", "https://u.example/view?messageId=103"]);
});

test("과거 글도 상세 차단은 건너뛰고 다른 오류는 알린다", async () => {
  const { ctx } = context(rss, { idParam: "messageId", content: ".content" });
  const [post] = await archiveRssBoard.list(ctx, "2026-01-01");
  ctx.fetchHtml = async (url) => { throw new RobotsBlockedError(url); };
  assert.equal(await archiveRssBoard.read!(ctx, post), null);
  ctx.fetchHtml = async () => { throw new Error("읽기 실패"); };
  await assert.rejects(archiveRssBoard.read!(ctx, post), /읽기 실패/);
});

test("번호 없는 글과 중복 글을 걸러내고 피드 설정 누락을 알린다", async () => {
  const duplicate = rss.replace("</channel>", `${rss.match(/<item>[\s\S]*<\/item>/)![0]}<item><title>번호 없음</title><link>/view</link></item></channel>`);
  const { ctx } = context(duplicate);
  assert.equal((await collectRssBoard(ctx)).length, 1);
  delete ctx.source.rss;
  await assert.rejects(collectRssBoard(ctx), /"rss" 설정이 없음/);
});

test("rss-board가 일반 수집기와 과거 글 수집기에 등록되어 있다", () => {
  assert.equal(collectors["rss-board"], collectRssBoard);
  assert.equal(archivers["rss-board"], archiveRssBoard);
});
