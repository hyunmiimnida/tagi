// 수집 기록(data/collect-log.json). 매번 새로 쓰지만, 출처마다 "마지막으로 실제 수집에 성공한 때"는 이전 기록에서 이어받는다
// (GitHub Actions가 돌면 내 컴퓨터에서만 수집하는 출처는 "건너뜀"이라, 그대로 덮어쓰면 마지막 성공 시각이 사라진다)

export interface SourceLog {
  source: string;
  ok: boolean;
  count: number; // 이번에 읽은 새 게시물 수
  message: string; // 실패 이유나 건너뛴 이유. 실제로 읽었으면 ""
  lastSuccessAt?: string; // 마지막으로 실제 수집에 성공한 시각
  lastSuccessCount?: number; // 그때 읽은 새 게시물 수
}

export interface CollectLog {
  ranAt: string;
  total: number;
  sources: SourceLog[];
}

export function mergeCollectLog(previous: CollectLog | null, entries: SourceLog[], ranAt: string, total: number): CollectLog {
  const before = new Map((previous?.sources ?? []).map((entry) => [entry.source, entry]));
  return {
    ranAt,
    total,
    sources: entries.map((entry) => {
      const read = entry.ok && entry.message === "";
      const old = before.get(entry.source);
      return read
        ? { ...entry, lastSuccessAt: ranAt, lastSuccessCount: entry.count }
        : { ...entry, lastSuccessAt: old?.lastSuccessAt, lastSuccessCount: old?.lastSuccessCount };
    }),
  };
}
