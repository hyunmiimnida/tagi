import assert from "node:assert/strict";
import test from "node:test";
import { applyCampus, campusOf } from "./campus.ts";
import { emptyProgram } from "./types.ts";
import type { School, Source } from "./types.ts";

const source = { id: "x-notice", name: "공지", collector: "table-board", url: "https://u.example", enabled: true } as Source;
const school: School = {
  id: "x",
  name: "예시대학교",
  shortName: "예시대",
  sources: [source],
  campuses: [{ schoolId: "x-global", labels: ["국제"], titleKeywords: ["[국제]"] }],
};

test("목록의 캠퍼스 표시가 있으면 표시로, 없으면 제목으로 다른 캠퍼스를 가린다", () => {
  assert.equal(campusOf(school, "학습컨설팅 신청", "국제"), "x-global");
  assert.equal(campusOf(school, "학습컨설팅 신청", "주요알림 국제 행사"), "x-global");
  assert.equal(campusOf(school, "[국제] 특강", "공통"), undefined); // 표시가 "공통"이면 제목에 캠퍼스 이름이 있어도 옮기지 않는다
  assert.equal(campusOf(school, "[국제] 특강"), "x-global");
  assert.equal(campusOf(school, "국제교류 프로그램 모집"), undefined);
});

test("다른 캠퍼스 글은 모집 대상 학교도 그 캠퍼스로 바꾸고, 다른 학교도 지원하는 글은 비워 둔다", () => {
  const program = emptyProgram(school, source, "1", "특강", "https://u.example/1");
  applyCampus(program, school, "국제");
  assert.equal(program.campus, "x-global");
  assert.deepEqual(program.target.schools, ["x-global"]);

  const open = emptyProgram(school, source, "2", "[국제] 공모전", "https://u.example/2");
  open.target.openTo = "전국 대학생";
  open.target.schools = [];
  applyCampus(open, school);
  assert.equal(open.campus, "x-global");
  assert.deepEqual(open.target.schools, []);
});
