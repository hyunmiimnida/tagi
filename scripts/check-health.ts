import { readFileSync } from "node:fs";
import { healthProblems } from "../src/collect-log.ts";
import type { CollectLog } from "../src/collect-log.ts";

// 수집 상태 점검. 문제가 있으면 내용을 출력한다 (GitHub Actions가 이 내용으로 "수집 점검 필요" 이슈를 만든다)
//   node scripts/check-health.ts
const log: CollectLog = JSON.parse(readFileSync(new URL("../data/collect-log.json", import.meta.url), "utf8"));
const problems = healthProblems(log);
if (problems.length > 0) {
  console.log(`수집 점검이 필요한 출처가 있어요 (${log.ranAt.slice(0, 16).replace("T", " ")} UTC 기준).\n`);
  for (const problem of problems) console.log(`- ${problem}`);
  console.log("\n영남대(내 컴퓨터에서만 수집) 출처라면 내 컴퓨터 수집(scripts/collect-local.ps1)이 돌았는지 확인하세요.");
  console.log("다른 출처라면 학교 사이트 구조가 바뀌었을 수 있어요. 로그(GitHub Actions)를 확인하세요.");
}
