"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

// 마감 알림(웹 푸시) 켜기·끄기. 브라우저가 만든 "알림 받을 주소"를 Supabase push_subscriptions 표에 저장하면
// 매일 아침 GitHub Actions(scripts/notify.ts)가 내일 마감인 관심 공고를 알려 준다.

// 공개 키 (비밀 키는 GitHub Secrets의 VAPID_PRIVATE_KEY)
export const VAPID_PUBLIC_KEY = "BKpj1huJkTiQC90cOuHKjNNRzIEsimmitRtwaN3IrK_hwBI3AnsAxc9dtKfk7EyuggzcDLGpJ0u4idfEaT0ARY8";

export type PushResult = "on" | "off" | "unsupported" | "denied" | "failed";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// 아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있다
export const needsInstallForPush = () =>
  typeof window !== "undefined" &&
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !window.matchMedia("(display-mode: standalone)").matches;

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // 개발 중에는 서비스 워커를 등록하지 않으므로 여기서 등록한다
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
}

export async function enablePush(supabase: SupabaseClient, userId: string): Promise<PushResult> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    const json = subscription.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert({
      endpoint: subscription.endpoint,
      user_id: userId,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    });
    if (error) return "failed";
    // 이 기기에서 알림이 실제로 보이는지 바로 확인할 수 있게 확인 알림을 띄운다
    await reg
      .showNotification("캠퍼스모아 알림이 켜졌어요", {
        body: "관심 공고 모집 마감 하루 전 아침 9시에 이렇게 알려 드릴게요.",
        icon: "/icon-192.png",
        data: { url: "/calendar" },
      })
      .catch(() => {});
    return "on";
  } catch {
    return "failed";
  }
}

export async function disablePush(supabase: SupabaseClient): Promise<PushResult> {
  if (!pushSupported()) return "off";
  const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (subscription) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe().catch(() => {});
  }
  return "off";
}

// 이 기기가 알림 받을 주소를 가지고 있는지 (다른 기기에서 알림을 켰으면 이 기기는 없을 수 있다)
export async function pushOnThisDevice(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}
