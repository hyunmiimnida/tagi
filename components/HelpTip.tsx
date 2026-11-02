"use client";

import { useEffect, useId, useRef, useState } from "react";

// 카드 오른쪽 위의 물음표: 눌러야 설명이 보인다. 바깥을 누르거나 Esc를 누르면 닫힌다
export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span className="help-tip" ref={box}>
      <button
        type="button"
        className="help-tip-button"
        aria-label={`${label} 설명`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      {open && (
        <div id={id} className="help-tip-box" role="note">
          {children}
        </div>
      )}
    </span>
  );
}
