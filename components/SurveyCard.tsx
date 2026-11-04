"use client";

import { useEffect, useState } from "react";
import { anonId, track } from "../lib/analytics.ts";
import { answersComplete, surveyFor } from "../lib/research.ts";
import type { Answers, Survey } from "../lib/research.ts";
import { supabase, useUser } from "../lib/user.tsx";

const HIDE_KEY = "survey-hidden"; // 닫았거나 답한 설문 번호

function readHidden(): Set<number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HIDE_KEY) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : []);
  } catch {
    return new Set();
  }
}

function hide(id: number) {
  try {
    localStorage.setItem(HIDE_KEY, JSON.stringify([...readHidden(), id]));
  } catch {
    // 저장소를 못 쓰면 이번 방문에만 숨긴다
  }
}

// 홈의 짧은 설문 카드: 관리자 화면 "리서치 → 설문"에서 켠 설문 중 나에게 맞는 것 하나를 한 번만 보여 준다 (닫으면 다시 안 보임).
// 답은 submit_survey 함수로만 보낸다 (supabase/research-data.sql, 한 사람·기기당 한 번)
export function SurveyCard() {
  const { ready, signedIn, schoolId } = useUser();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  useEffect(() => {
    if (!supabase || !ready) return;
    let alive = true;
    void Promise.resolve(
      supabase.from("surveys").select("id, title, questions, audience, school_id").order("created_at", { ascending: false }).limit(5),
    )
      .then(({ data }) => {
        if (!alive) return;
        const hidden = readHidden();
        const next = ((data ?? []) as Survey[]).find((s) => Array.isArray(s.questions) && surveyFor(s, { signedIn, schoolId }, hidden)) ?? null;
        setSurvey(next);
        if (next) track("survey_view", { survey: next.id });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, signedIn, schoolId]);

  if (!survey) return null;

  const close = () => {
    hide(survey.id);
    setSurvey(null);
  };

  if (state === "done") {
    return (
      <section className="section install-card">
        <strong>답해 주셔서 고마워요!</strong>
        <div className="install-actions">
          <button className="text-button" onClick={close}>
            닫기
          </button>
        </div>
      </section>
    );
  }

  const set = (id: string, value: Answers[string]) => setAnswers((current) => ({ ...current, [id]: value }));
  const send = async () => {
    const anon = anonId();
    if (!supabase || !anon) return setState("error");
    setState("sending");
    const { error } = await supabase.rpc("submit_survey", { target: survey.id, anon, answers });
    if (!error || error.message.includes("survey:done")) {
      hide(survey.id);
      setState("done");
    } else setState("error");
  };

  return (
    <section className="section survey-card">
      <div className="survey-head">
        <strong>{survey.title}</strong>
        <button className="text-button" onClick={close}>
          닫기
        </button>
      </div>
      {survey.questions.map((q) => {
        const value = answers[q.id];
        return (
          <fieldset key={q.id} className="survey-question">
            <legend>{q.title}</legend>
            {(q.type === "choice" || q.type === "multi") && (
              <div className="my-options">
                {(q.options ?? []).map((option) => {
                  const picked = q.type === "multi" ? Array.isArray(value) && value.includes(option) : value === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`tag-option ${picked ? "on" : ""}`}
                      aria-pressed={picked}
                      onClick={() => {
                        if (q.type === "choice") return set(q.id, option);
                        const list = Array.isArray(value) ? value : [];
                        set(q.id, picked ? list.filter((v) => v !== option) : [...list, option]);
                      }}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}
            {q.type === "rating" && (
              <div className="my-options" role="group" aria-label={`${q.title} 점수`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={`tag-option ${value === n ? "on" : ""}`} aria-pressed={value === n} onClick={() => set(q.id, n)}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            {q.type === "text" && (
              <textarea
                className="survey-text"
                maxLength={500}
                rows={2}
                value={typeof value === "string" ? value : ""}
                placeholder="개인정보는 적지 말아 주세요"
                onChange={(event) => set(q.id, event.target.value)}
              />
            )}
          </fieldset>
        );
      })}
      {state === "error" && <p className="nickname-note">보내지 못했어요. 잠시 뒤 다시 해 주세요.</p>}
      <button className="button primary wide" disabled={state === "sending" || !answersComplete(survey.questions, answers)} onClick={() => void send()}>
        {state === "sending" ? "보내는 중…" : "보내기"}
      </button>
    </section>
  );
}
