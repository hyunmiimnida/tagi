"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CONSENT_PRIVACY_SUMMARY } from "../lib/policy.ts";
import { useUser } from "../lib/user.tsx";
import { ChevronIcon } from "./Icons.tsx";

// 가입 동의 화면: 처음 로그인(가입)했거나 약관 판(CONSENT_VERSION)이 바뀐 뒤 처음 들어온 회원에게 한 번 보여 준다.
// 필수 세 가지를 모두 체크해야 시작할 수 있고, 동의하지 않으면 로그아웃한다. 기록은 supabase/consent.sql (lib/user.tsx의 agreeTerms)
const ITEMS = [
  { id: "age", label: "만 14세 이상이에요" },
  { id: "terms", label: "이용약관 동의", href: "/terms" },
  { id: "privacy", label: "개인정보 수집·이용 동의", href: "/privacy", summary: CONSENT_PRIVACY_SUMMARY },
] as const;

type ItemId = (typeof ITEMS)[number]["id"];

export function ConsentSheet() {
  const { consentNeeded, agreeTerms, declineTerms } = useUser();
  const [checked, setChecked] = useState<ReadonlySet<ItemId>>(new Set());
  const [opened, setOpened] = useState<ItemId | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState(false); // npm run dev에서 주소에 ?consent를 붙이면 로그인 없이 화면만 본다 (저장 안 함)
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const all = checked.size === ITEMS.length;
  const show = consentNeeded || preview;

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).has("consent")) setPreview(true);
  }, []);

  useEffect(() => {
    if (!show) return;
    // 키보드로 쓰는 사람을 위해: 창 안으로 초점을 옮기고 Tab은 창 안에서만 돈다 (꼭 골라야 하는 창이라 Esc로 닫지 않는다)
    const focusable = () => [...(sheetRef.current?.querySelectorAll<HTMLElement>("input, button:not(:disabled), a[href]") ?? [])];
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const list = focusable();
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  if (!show) return null;

  const toggle = (id: ItemId) =>
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    if (!all || sending) return;
    if (preview && !consentNeeded) return setPreview(false);
    setSending(true);
    setFailed(false);
    const ok = await agreeTerms();
    setSending(false);
    if (!ok) setFailed(true);
  };

  return (
    <div className="overlay">
      <div ref={sheetRef} className="sheet consent-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={48} height={48} className="sheet-logo" />
        <h2 id={titleId}>캠퍼스모아 시작하기</h2>
        <p>서비스 이용을 위해 약관에 동의해 주세요.</p>

        <label className="consent-all">
          <input
            type="checkbox"
            checked={all}
            onChange={() => setChecked(all ? new Set() : new Set(ITEMS.map((item) => item.id)))}
          />
          <strong>모두 동의하기</strong>
        </label>

        <ul className="consent-list">
          {ITEMS.map((item) => (
            <li key={item.id}>
              <div className="consent-row">
                <label>
                  <input type="checkbox" checked={checked.has(item.id)} onChange={() => toggle(item.id)} />
                  <span>
                    <span className="consent-required">(필수)</span> {item.label}
                  </span>
                </label>
                {"summary" in item ? (
                  <button
                    type="button"
                    className="consent-view"
                    aria-expanded={opened === item.id}
                    onClick={() => setOpened(opened === item.id ? null : item.id)}
                  >
                    보기 <ChevronIcon size={14} />
                  </button>
                ) : "href" in item ? (
                  <a className="consent-view" href={item.href} target="_blank" rel="noreferrer">
                    보기 <ChevronIcon size={14} />
                  </a>
                ) : null}
              </div>
              {"summary" in item && opened === item.id && (
                <div className="consent-detail">
                  <ul>
                    {item.summary.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <a href={item.href} target="_blank" rel="noreferrer">
                    개인정보처리방침 전문 보기
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>

        <button className="button primary wide" type="button" disabled={!all || sending} onClick={submit}>
          {sending ? "저장하는 중…" : "동의하고 시작하기"}
        </button>
        {failed && (
          <p className="consent-error" role="alert">
            저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.
          </p>
        )}
        <button className="text-button consent-decline" type="button" onClick={preview && !consentNeeded ? () => setPreview(false) : declineTerms}>
          동의하지 않고 나가기
        </button>
      </div>
    </div>
  );
}
