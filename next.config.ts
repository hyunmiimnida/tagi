import type { NextConfig } from "next";

// 공고 상세 화면과 공유 미리보기 그림은 처음 열 때 서버에서 만든다 (app/programs/[id]/page.tsx).
// 서버가 읽는 데이터 파일은 코드에서 경로를 조립해 읽어서 자동으로 배포 묶음에 들어가지 않으므로 여기 적는다.
// 큰 보관함(data/archive.json)은 넣지 않는다: 지난 회차는 public/api/series/의 작은 파일에서 읽는다
const DATA_FILES = ["./data/programs.json", "./config/*.json", "./public/api/series/**"];
// 경로를 조립해 읽는 코드 때문에 Next가 프로젝트 전체를 넣으려 하므로, 서버가 읽지 않는 큰 파일·폴더는 뺀다
const NOT_READ = [
  "./data/archive.json",
  "./data/excluded.json",
  "./data/*-decisions.json",
  "./public/api/*.json",
  "./public/*.png",
  "./mobile/**",
  "./design/**",
  "./docs/**",
  "./logs/**",
  "./test/**",
  "./.cache/**",
];

const config: NextConfig = {
  outputFileTracingIncludes: {
    "/programs/**": DATA_FILES,
  },
  outputFileTracingExcludes: {
    "/**": NOT_READ,
  },
};

export default config;
