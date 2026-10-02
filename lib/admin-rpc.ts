"use client";

import { describeError } from "./admin.ts";
import { supabase } from "./user.tsx";

// 관리 함수(supabase/admin.sql) 부르기. 오류는 사람이 읽을 수 있는 문장으로 바꾼다
export async function adminRpc<T>(name: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  if (!supabase) return { data: null, error: "Supabase가 설정되지 않았어요." };
  const { data, error } = await supabase.rpc(name, args);
  return { data: (data as T | null) ?? null, error: error ? describeError(error) : null };
}
