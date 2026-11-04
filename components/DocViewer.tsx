"use client";

import { useEffect, useRef } from "react";
import { useExit } from "../lib/use-exit.ts";
import { CloseIcon } from "./Icons.tsx";

// 약관·방침 같은 문서를 지금 화면 위 창 안에서 보여 준다 (가입 동의 화면의 "보기").
// 같은 사이트의 문서 화면을 iframe(?embed=1)으로 열고, 머리말·탭 바·바닥글은 숨긴다 (html.embedded, app/layout.tsx·app/globals.css).
// 창은 페이드로 열리고 닫힌다. onAgree가 있으면 맨 아래 "동의하기"로 그 항목을 체크하고 닫는다
export function DocViewer({
  doc,
  onClose,
  onAgree,
}: {
  doc: { title: string; href: string } | null;
  onClose: () => void;
  onAgree?: () => void;
}) {
  const { mounted, closing } = useExit(doc !== null);
  const last = useRef(doc);
  if (doc) last.current = doc;
  const shown = doc ?? last.current;
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  const isOpen = doc !== null;
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      opener?.focus();
    };
  }, [isOpen]);

  if (!mounted || !shown) return null;

  return (
    <div className={`doc-viewer-backdrop${closing ? " closing" : ""}`}>
      <div ref={panelRef} className={`doc-viewer${closing ? " closing" : ""}`} role="dialog" aria-modal="true" aria-label={shown.title}>
        <div className="doc-viewer-head">
          <strong>{shown.title}</strong>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            <CloseIcon size={20} />
          </button>
        </div>
        <iframe
          className="doc-viewer-frame"
          src={`${shown.href}?embed=1`}
          title={shown.title}
          // 문서 화면이 ?embed=1을 보고 스스로 머리말·탭 바를 숨긴다 (app/layout.tsx의 작은 스크립트). 다 읽으면 페이드인
          onLoad={(event) => event.currentTarget.classList.add("loaded")}
        />
        <div className="doc-viewer-foot">
          {onAgree ? (
            <button type="button" className="button primary wide" onClick={onAgree}>
              동의하기
            </button>
          ) : (
            <button type="button" className="button wide" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
