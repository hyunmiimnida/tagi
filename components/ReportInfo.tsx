"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/user.tsx";

// "정보가 틀렸어요": 공고 정보 오류를 운영자에게 알린다 (supabase/program-reports.sql). 로그인하지 않아도 된다
const REASONS = ["날짜가 틀려요", "이미 마감됐어요", "학생 대상이 아니에요", "대상·자격이 틀려요", "같은 공고가 또 있어요", "기타"];

export function ReportInfo({ programId }: { programId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "already" | "failed" | "busy">("idle");
  const formRef = useRef<HTMLDivElement | null>(null);

  // 열면 보내기 버튼까지 보이게 올린다 (화면 아래에 붙어 있는 "원문에서 신청하기" 줄에 가리지 않게, CSS scroll-margin-bottom)
  useEffect(() => {
    if (open) formRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  if (!supabase) return null;

  async function send() {
    if (!supabase || !reason) return;
    setState("sending");
    const { error } = await supabase
      .from("program_reports")
      .insert({ program_id: programId, reason, note: note.trim() || null });
    // 도배 막기(supabase/program-reports-guard.sql)에 걸리면 이유에 맞게 안내한다
    const spam = error?.message.match(/spam:(\w+)/)?.[1];
    if (spam === "duplicate" || spam === "program") setState("already");
    else if (spam === "too_many") setState("busy");
    else setState(error ? "failed" : "done");
  }

  if (state === "done") {
    return <p className="report-info-done">알려 주셔서 고마워요. 확인하고 바로잡을게요.</p>;
  }
  if (state === "already") {
    return <p className="report-info-done">같은 내용이 이미 접수됐어요. 확인하고 바로잡을게요.</p>;
  }

  return (
    <div className="report-info">
      {!open ? (
        <button className="text-button" onClick={() => setOpen(true)}>
          정보가 틀렸어요
        </button>
      ) : (
        <div className="report-info-form" ref={formRef}>
          <p className="report-info-title">어떤 정보가 틀렸나요?</p>
          <div className="report-reasons" role="group" aria-label="틀린 정보">
            {REASONS.map((r) => (
              <button
                key={r}
                className={`report-reason ${reason === r ? "on" : ""}`}
                aria-pressed={reason === r}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            maxLength={300}
            rows={2}
            placeholder="(선택) 맞는 정보를 알려 주세요. 예: 마감일은 10월 15일이에요"
            aria-label="자세한 내용"
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="nickname-note">이름·전화번호 같은 개인정보는 적지 마세요.</p>
          {state === "failed" && <p className="report-info-error">보내지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
          {state === "busy" && <p className="report-info-error">신고가 너무 많이 들어오고 있어요. 1시간쯤 뒤에 다시 보내 주세요.</p>}
          <div className="report-info-actions">
            <button className="text-button" onClick={() => setOpen(false)}>
              취소
            </button>
            <button className="button primary small" disabled={!reason || state === "sending"} onClick={send}>
              {state === "sending" ? "보내는 중" : "보내기"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
