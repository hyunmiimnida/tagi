import type { Archiver, Collector } from "../types.ts";
import { archiveCareerProgramList, collectCareerProgramList } from "./career-program-list.ts";
import { archiveNewsBoard, collectNewsBoard } from "./news-board.ts";
import { archiveTableBoard, collectTableBoard } from "./table-board.ts";

// 수집기 등록부. config/schools.json의 "collector" 값과 이름이 같아야 한다.
export const collectors: Record<string, Collector> = {
  "career-program-list": collectCareerProgramList,
  "news-board": collectNewsBoard,
  "table-board": collectTableBoard,
};

// 과거 글 수집기 (npm run backfill). 없는 수집기는 과거 글을 모으지 않는다
export const archivers: Record<string, Archiver> = {
  "career-program-list": archiveCareerProgramList,
  "news-board": archiveNewsBoard,
  "table-board": archiveTableBoard,
};
