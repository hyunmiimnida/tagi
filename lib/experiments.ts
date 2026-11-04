"use client";

import { useEffect, useState } from "react";
import { anonId, track } from "./analytics.ts";
import { assignVariant } from "./research.ts";
import type { Variant } from "./research.ts";
import { supabase } from "./user.tsx";

// A/B 테스트: useVariant("실험 이름")이 이 기기에 변형 하나를 고정으로 정해 준다 (같은 사람은 늘 같은 변형).
// 관리자 화면 "리서치 → A/B"에서 켠 실험만 돌고, 꺼져 있거나 없으면 null → 화면은 원래 모습(기본)을 보여 준다.
// 처음 보일 때 exposure 기록을 남기고, 목표 기록(실험의 goal)과 비교해 변형마다 달성률을 본다.
// 붙이는 방법은 CLAUDE.md "A/B 테스트" 참고

let running: Promise<Map<string, Variant[]>> | null = null;

function loadRunning(): Promise<Map<string, Variant[]>> {
  if (!supabase) return Promise.resolve(new Map());
  running ??= Promise.resolve(supabase.from("experiments").select("id, variants"))
    .then(({ data }) => new Map(((data ?? []) as { id: string; variants: Variant[] }[]).map((e) => [e.id, e.variants])))
    .catch(() => new Map());
  return running;
}

const exposed = new Set<string>(); // 이번 방문에 노출 기록을 남긴 실험

export function useVariant(experiment: string): string | null {
  const [variant, setVariant] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadRunning().then((list) => {
      const variants = list.get(experiment);
      const anon = anonId();
      if (!alive || !variants || !anon) return;
      const picked = assignVariant(anon, experiment, variants);
      setVariant(picked);
      if (picked && !exposed.has(experiment)) {
        exposed.add(experiment);
        track("exposure", { exp: experiment, variant: picked });
      }
    });
    return () => {
      alive = false;
    };
  }, [experiment]);
  return variant;
}
