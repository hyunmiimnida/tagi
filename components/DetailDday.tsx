"use client";

import { useToday } from "../lib/user.tsx";
import { DdayBadge } from "./ProgramRow.tsx";
import type { ProgramView } from "../lib/filter.ts";

// 상세 화면 제목 위의 마감 배지 (오늘 마감·D-3·마감). 상세 화면은 미리 만들어 두므로 오늘 날짜는 브라우저에서 계산한다
export function DetailDday({ end }: { end: string | null }) {
  const today = useToday();
  if (!today || !end) return null;
  return <DdayBadge program={{ recruitPeriod: { start: null, end } } as ProgramView} today={today} />;
}
