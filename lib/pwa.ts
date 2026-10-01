"use client";

// "홈 화면에 추가" 안내. 안드로이드 크롬이 설치 가능하다고 알려 주면(beforeinstallprompt) 기억해 둔다
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let pending: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pending = event as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    pending = null;
    notify();
  });
}

export function subscribeInstall(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const canInstall = () => pending !== null;

export async function install() {
  if (!pending) return;
  const event = pending;
  pending = null;
  notify();
  await event.prompt();
}

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production") return; // 개발 중에는 저장된 화면이 헷갈리게 하지 않도록 끈다
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
