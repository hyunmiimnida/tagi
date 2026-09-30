import type { Collector } from "../types.ts";
import { collectCareerProgramList } from "./career-program-list.ts";
import { collectNewsBoard } from "./news-board.ts";

// 수집기 등록부. config/schools.json의 "collector" 값과 이름이 같아야 한다.
export const collectors: Record<string, Collector> = {
  "career-program-list": collectCareerProgramList,
  "news-board": collectNewsBoard,
};
