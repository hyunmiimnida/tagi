"use client";

import { useEffect, useState } from "react";
import type { ProgramView } from "./filter.ts";
import { fromListProgram, LIST_URL } from "./list.ts";
import type { ListProgram } from "./list.ts";

// 목록 데이터(public/api/list.json)를 한 번만 받아 모든 화면이 같이 쓴다.
// 화면을 옮겨 다녀도 다시 받지 않고, 오프라인이면 서비스 워커(public/sw.js)가 저장해 둔 것을 준다
let listPromise: Promise<ProgramView[]> | null = null;

function loadList(): Promise<ProgramView[]> {
  listPromise ??= fetch(LIST_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`목록을 받지 못함 (${response.status})`);
      return response.json() as Promise<{ programs: ListProgram[] }>;
    })
    .then((data) => data.programs.map(fromListProgram))
    .catch((error: unknown) => {
      listPromise = null; // 다음에 다시 시도한다
      throw error;
    });
  return listPromise;
}

// 받는 중이면 null, 받지 못하면 failed가 true
export function useListPrograms(): { programs: ProgramView[] | null; failed: boolean; retry: () => void } {
  const [programs, setPrograms] = useState<ProgramView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadList().then(
      (list) => !cancelled && setPrograms(list),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { programs, failed, retry: () => setAttempt((n) => n + 1) };
}

// 반복 프로그램 묶음 → [최근 회차 제목, 지금 목록의 공고 id]. 내 댓글·관리자 화면에서 댓글이 어느 공고인지 보여 줄 때만 받는다
export type SeriesInfo = Record<string, [title: string, currentId: string | null]>;
let seriesPromise: Promise<SeriesInfo> | null = null;

export function useSeriesInfo(enabled = true): SeriesInfo {
  const [info, setInfo] = useState<SeriesInfo>({});
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    seriesPromise ??= fetch("/api/series-info.json")
      .then((response) => (response.ok ? (response.json() as Promise<SeriesInfo>) : {}))
      .catch(() => {
        seriesPromise = null;
        return {};
      });
    void seriesPromise.then((data) => !cancelled && setInfo(data));
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return info;
}
