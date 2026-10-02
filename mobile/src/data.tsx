import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SITE_URL } from "@shared/filter.ts";
import type { FilterCategory, ProgramView, SchoolOption } from "@shared/filter.ts";

// 공고 데이터는 사이트가 매일 만들어 두는 파일(public/api)을 받아 온다.
// 받은 데이터는 휴대폰에 저장해 두고, 다음에 켤 때 먼저 보여 준 뒤 새 데이터로 바꾼다 (인터넷이 없어도 마지막 데이터가 보인다)

export const API_BASE = `${SITE_URL}/api`; // 사이트 주소는 lib/filter.ts의 SITE_URL 한 곳에서 정한다
const SUPPORTED_VERSION = 1;
const CACHE_KEY = "data-cache-v1";

export interface Meta {
  collectedAt: string | null;
  categories: FilterCategory[];
  schools: SchoolOption[];
  sourceNames: Record<string, string>;
}

interface Snapshot {
  programs: ProgramView[];
  meta: Meta;
  savedAt: string;
}

interface DataState {
  programs: ProgramView[];
  meta: Meta | null;
  loading: boolean; // 처음 불러오는 중 (저장된 데이터도 없을 때)
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}/${path}`);
  if (!response.ok) throw new Error(`데이터를 받지 못했어요 (${response.status})`);
  return response.json() as Promise<T>;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [list, meta] = await Promise.all([
        fetchJson<{ version: number; programs: ProgramView[] }>("programs.json"),
        fetchJson<{ version: number } & Meta>("meta.json"),
      ]);
      if (list.version > SUPPORTED_VERSION) throw new Error("앱을 최신 버전으로 업데이트해 주세요");
      const next = { programs: list.programs, meta, savedAt: new Date().toISOString() };
      setSnapshot(next);
      setError(null);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 받지 못했어요");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 저장해 둔 데이터를 먼저 보여 주고, 곧바로 새 데이터를 받아 온다
    AsyncStorage.getItem(CACHE_KEY)
      .then((saved) => {
        if (saved) {
          setSnapshot(JSON.parse(saved) as Snapshot);
          setLoading(false);
        }
      })
      .catch(() => {})
      .finally(() => void refresh());
  }, [refresh]);

  return (
    <DataContext
      value={{ programs: snapshot?.programs ?? [], meta: snapshot?.meta ?? null, loading, refreshing, error, refresh }}
    >
      {children}
    </DataContext>
  );
}

export function useData(): DataState {
  const value = useContext(DataContext);
  if (!value) throw new Error("DataProvider 안에서만 쓸 수 있어요");
  return value;
}

// 오늘 날짜 "2026-10-01" (휴대폰 시간 기준)
export function todayString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
