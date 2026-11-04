"use client";

import type { EventName } from "./research.ts";
import { supabase } from "./user.tsx";

// 이용 기록 보내기 (관리자 화면 "리서치"의 퍼널·히트맵·A/B). 서버는 supabase/research-data.sql의 track_event.
// · 기기마다 무작위 값(anon_id)으로만 구분한다. IP·기기 정보·입력한 글자·검색어 원문은 보내지 않는다.
// · 누가 보내나: 로그인 안 한 방문자(계정 연결 없음)와, 가입 동의(supabase/consent.sql)를 마친 회원. 로그인했는데 아직 동의하지 않은
//   사람은 보내지 않는다. 로그인 상태를 알기 전에 생긴 기록은 모아 두었다가 상태가 정해지면 보내거나 버린다 (lib/user.tsx가 setAnalyticsAccount).
// · 브라우저의 GPC(개인정보 보호 신호)가 켜져 있으면 보내지 않는다.
// · 보내다 실패해도(표가 아직 없음·오프라인 등) 조용히 버린다. 화면은 절대 멈추지 않는다.
// 화면 곳곳에서는 track("이름", { ... }) 한 줄로 부른다

const ANON_KEY = "tagi:anon";
const SESSION_KEY = "tagi:session";
const BATCH = 20; // 한 번에 보내는 수 (서버 한도와 같다)

type Props = Record<string, string | number | boolean | null>;
interface QueuedEvent {
  name: EventName;
  path: string;
  props: Props;
}

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function storage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

// 브라우저의 GPC(개인정보 보호 신호)
export function browserSaysNo(): boolean {
  if (typeof navigator === "undefined") return true;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

// 지금 보내도 되는 사람인지: pending(로그인 상태를 아직 모름) · guest(로그인 안 함) · agreed(가입 동의함) · blocked(로그인했지만 동의 전)
export type AnalyticsAccount = "pending" | "guest" | "agreed" | "blocked";
let account: AnalyticsAccount = "pending";

export function setAnalyticsAccount(next: AnalyticsAccount) {
  if (next === account) return;
  account = next;
  if (next === "blocked") queue = []; // 동의 전에 쌓인 것은 버린다
  else if (next !== "pending" && queue.length > 0) {
    clearTimeout(timer);
    timer = setTimeout(flush, 0);
  }
}

export const analyticsAllowed = () => Boolean(supabase) && !browserSaysNo() && account !== "blocked";

// 이 기기의 무작위 값 (없으면 만든다). 저장소를 못 쓰면 null → 보내지 않는다
export function anonId(): string | null {
  const local = storage("local");
  if (!local) return null;
  try {
    let id = local.getItem(ANON_KEY);
    if (!id) {
      id = randomId();
      local.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function sessionId(): string {
  const session = storage("session");
  try {
    let id = session?.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      session?.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "none";
  }
}

export function track(name: EventName, props: Props = {}) {
  try {
    if (typeof window === "undefined" || !analyticsAllowed()) return;
    if (window.self !== window.top) return; // 관리자 화면의 히트맵 미리보기(iframe) 안에서는 남기지 않는다
    if (queue.length >= 100) return; // 로그인 상태를 모르는 채로 너무 많이 쌓이지 않게
    queue.push({ name, path: window.location.pathname, props });
    if (account === "pending") return; // 상태가 정해지면 setAnalyticsAccount가 보낸다
    clearTimeout(timer);
    timer = setTimeout(flush, queue.length >= BATCH ? 0 : 2000);
  } catch {
    // 기록 실패는 무시
  }
}

export function flush() {
  try {
    if (!supabase || queue.length === 0 || account === "pending" || account === "blocked") return;
    const anon = anonId();
    if (!anon) {
      queue = [];
      return;
    }
    const events = queue.splice(0, BATCH);
    void supabase.rpc("track_event", { anon, session: sessionId(), events }).then(
      () => {},
      () => {},
    );
    if (queue.length > 0) timer = setTimeout(flush, 500);
  } catch {
    queue = [];
  }
}

// 화면을 떠날 때 남은 것을 보낸다
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
