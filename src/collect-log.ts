// 수집 기록(data/collect-log.json). 매번 새로 쓰지만, 출처마다 "마지막으로 실제 수집에 성공한 때"는 이전 기록에서 이어받는다
// (GitHub Actions가 돌면 내 컴퓨터에서만 수집하는 출처는 "건너뜀"이라, 그대로 덮어쓰면 마지막 성공 시각이 사라진다)

export interface SourceLog {
  source: string;
  ok: boolean;
  count: number; // 이번에 읽은 새 게시물 수
  message: string; // 실패 이유나 건너뛴 이유. 실제로 읽었으면 ""
  lastSuccessAt?: string; // 마지막으로 실제 수집에 성공한 시각
  lastSuccessCount?: number; // 그때 읽은 새 게시물 수
  failStreak?: number; // 연속으로 실패한 횟수 (성공하면 0, 건너뛰면 그대로)
}

export interface CollectLog {
  ranAt: string;
  total: number;
  sources: SourceLog[];
}

// 점검이 필요한 출처: 연속 실패가 3번 이상이거나, 마지막 성공이 3일 넘게 지난 곳
export const FAIL_STREAK_LIMIT = 3;
export const STALE_DAYS = 3;
export function healthProblems(log: CollectLog, now = Date.now()): string[] {
  const problems: string[] = [];
  for (const entry of log.sources) {
    if (entry.message === "robots.txt에서 막음") continue;
    if ((entry.failStreak ?? 0) >= FAIL_STREAK_LIMIT) {
      problems.push(`${entry.source}: ${entry.failStreak}번 연속 실패 (${entry.message})`);
    } else if (!entry.lastSuccessAt || now - Date.parse(entry.lastSuccessAt) > STALE_DAYS * 86_400_000) {
      problems.push(`${entry.source}: ${entry.lastSuccessAt ? `마지막 성공 ${entry.lastSuccessAt.slice(0, 10)}` : "성공 기록 없음"}`);
    }
  }
  return problems;
}

export function mergeCollectLog(previous: CollectLog | null, entries: SourceLog[], ranAt: string, total: number): CollectLog {
  const before = new Map((previous?.sources ?? []).map((entry) => [entry.source, entry]));
  return {
    ranAt,
    total,
    sources: entries.map((entry) => {
      const read = entry.ok && entry.message === "";
      const old = before.get(entry.source);
      const failStreak = read ? 0 : entry.ok ? (old?.failStreak ?? 0) : (old?.failStreak ?? 0) + 1;
      return read
        ? { ...entry, lastSuccessAt: ranAt, lastSuccessCount: entry.count, failStreak }
        : { ...entry, lastSuccessAt: old?.lastSuccessAt, lastSuccessCount: old?.lastSuccessCount, failStreak };
    }),
  };
}
