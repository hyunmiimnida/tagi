"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRpc } from "../../lib/admin-rpc.ts";
import { describeError, formatDateTime } from "../../lib/admin.ts";
import { QUESTION_TYPES, questionProblem, summarizeSurvey } from "../../lib/research.ts";
import type { Answers, Question, QuestionType, Survey } from "../../lib/research.ts";
import { supabase } from "../../lib/user.tsx";
import { RESEARCH_SQL } from "./AdminResearch.tsx";

interface SurveyRow extends Survey {
  active: boolean;
  ends_at: string | null;
  created_at: string;
}

const AUDIENCES = { all: "모두", login: "로그인한 사람", school: "그 학교를 고른 사람" } as const;

// 설문: 만들기·켜기/끄기·결과 (켜진 설문은 홈에 작은 카드로 한 번만 보인다, components/SurveyCard.tsx)
export function AdminSurveys() {
  const [list, setList] = useState<SurveyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("surveys").select("*").order("created_at", { ascending: false });
    setList(error ? null : (data as SurveyRow[]));
    setError(error ? describeError(error, RESEARCH_SQL) : null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setActive(row: SurveyRow, active: boolean) {
    if (!supabase) return;
    const { error } = await supabase.from("surveys").update({ active }).eq("id", row.id);
    if (error) setError(describeError(error, RESEARCH_SQL));
    void load();
  }

  return (
    <>
      <section className="card my-card">
        <div className="admin-line">
          <h2 className="card-title">설문</h2>
          <button className="button small" onClick={() => setCreating((v) => !v)}>
            {creating ? "닫기" : "새 설문"}
          </button>
        </div>
        {creating && (
          <SurveyEditor
            onSaved={() => {
              setCreating(false);
              void load();
            }}
          />
        )}
        {error && <p className="admin-error">{error}</p>}
        {list && list.length === 0 && !creating && <p className="card-sub">아직 만든 설문이 없어요.</p>}
        {list && list.length > 0 && (
          <ul className="admin-list">
            {list.map((s) => (
              <li key={s.id}>
                <div className="admin-line">
                  <button className="link-button" onClick={() => setOpened(opened === s.id ? null : s.id)}>
                    <strong>{s.title}</strong>
                  </button>
                  <label className="my-switch">
                    <span className="admin-meta">{s.active ? "켜짐" : "꺼짐"}</span>
                    <input type="checkbox" checked={s.active} onChange={(e) => void setActive(s, e.target.checked)} />
                  </label>
                </div>
                <div className="admin-meta">
                  {AUDIENCES[s.audience]}
                  {s.school_id && ` (${s.school_id})`} · 질문 {s.questions.length}개 · {formatDateTime(s.created_at)}
                  {s.ends_at && ` · ${formatDateTime(s.ends_at)}까지`}
                </div>
                {opened === s.id && <SurveyResults survey={s} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SurveyResults({ survey }: { survey: SurveyRow }) {
  const [data, setData] = useState<{ responses: number; answers: Answers[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void adminRpc<{ responses: number; answers: Answers[] }>("admin_survey_results", { target: survey.id }, RESEARCH_SQL).then((r) => {
      setData(r.data);
      setError(r.error);
    });
  }, [survey.id]);
  if (error) return <p className="admin-error">{error}</p>;
  if (!data) return <p className="card-sub">불러오는 중…</p>;
  const summary = summarizeSurvey(survey.questions, data.answers);
  return (
    <div className="survey-results">
      <p className="admin-meta">응답 {data.responses}명</p>
      {summary.map((s) => (
        <div key={s.question.id} className="admin-spaced">
          <strong>{s.question.title}</strong> <span className="admin-meta">({s.answered}명 답함)</span>
          {s.counts && (
            <ul className="survey-bars">
              {s.counts.map(([option, n]) => (
                <li key={option}>
                  <span>{option}</span>
                  <span className="funnel-bar">
                    <span style={{ width: `${s.answered ? (n / s.answered) * 100 : 0}%` }} />
                  </span>
                  <span className="admin-meta">{n}</span>
                </li>
              ))}
            </ul>
          )}
          {s.ratings && (
            <p className="admin-meta">
              평균 {s.average == null ? "-" : s.average.toFixed(2)}점 · {s.ratings.map((n, i) => `${i + 1}점 ${n}`).join(" · ")}
            </p>
          )}
          {s.texts &&
            (s.texts.length === 0 ? (
              <p className="admin-meta">답이 없어요.</p>
            ) : (
              <ul className="admin-list">
                {s.texts.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            ))}
        </div>
      ))}
    </div>
  );
}

const blankQuestion = (n: number): Question => ({ id: `q${n}`, type: "choice", title: "", options: ["", ""] });

function SurveyEditor({ onSaved }: { onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<Survey["audience"]>("all");
  const [schoolId, setSchoolId] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [questions, setQuestions] = useState<Question[]>([blankQuestion(1)]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, q: Partial<Question>) => setQuestions((list) => list.map((old, j) => (j === i ? { ...old, ...q } : old)));

  async function save() {
    const cleaned = questions.map((q) => ({
      ...q,
      title: q.title.trim(),
      options: q.type === "choice" || q.type === "multi" ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
    }));
    const problem = !title.trim() ? "설문 제목을 적어 주세요." : audience === "school" && !schoolId.trim() ? "학교 id를 적어 주세요 (예: yu)." : questionProblem(cleaned);
    if (problem) return setMessage(problem);
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from("surveys").insert({
      title: title.trim(),
      questions: cleaned,
      audience,
      school_id: audience === "school" ? schoolId.trim() : null,
      ends_at: endsAt ? new Date(`${endsAt}T23:59:59+09:00`).toISOString() : null,
      active: false,
    });
    setBusy(false);
    if (error) return setMessage(describeError(error, RESEARCH_SQL));
    onSaved();
  }

  return (
    <div className="survey-editor">
      <div className="nickname-row admin-spaced">
        <input value={title} maxLength={80} placeholder="설문 제목 (홈 카드에 보여요)" aria-label="설문 제목" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="my-options spaced">
        {(Object.keys(AUDIENCES) as Survey["audience"][]).map((a) => (
          <button key={a} className={`tag-option ${audience === a ? "on" : ""}`} aria-pressed={audience === a} onClick={() => setAudience(a)}>
            {AUDIENCES[a]}
          </button>
        ))}
      </div>
      {audience === "school" && (
        <div className="nickname-row admin-spaced">
          <input value={schoolId} placeholder="학교 id (config/schools.json, 예: yu)" aria-label="학교 id" onChange={(e) => setSchoolId(e.target.value)} />
        </div>
      )}
      <div className="nickname-row admin-spaced">
        <input type="date" value={endsAt} aria-label="마치는 날 (비우면 끌 때까지)" onChange={(e) => setEndsAt(e.target.value)} />
      </div>
      {questions.map((q, i) => (
        <fieldset key={q.id} className="survey-question admin-spaced">
          <legend>{i + 1}번 질문</legend>
          <div className="nickname-row">
            <select value={q.type} aria-label="질문 종류" onChange={(e) => update(i, { type: e.target.value as QuestionType })}>
              {(Object.keys(QUESTION_TYPES) as QuestionType[]).map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPES[t]}
                </option>
              ))}
            </select>
            {questions.length > 1 && (
              <button className="text-button" onClick={() => setQuestions((list) => list.filter((_, j) => j !== i))}>
                빼기
              </button>
            )}
          </div>
          <div className="nickname-row admin-spaced">
            <input value={q.title} maxLength={120} placeholder="질문" aria-label="질문" onChange={(e) => update(i, { title: e.target.value })} />
          </div>
          {(q.type === "choice" || q.type === "multi") && (
            <div className="nickname-row admin-spaced">
              <input
                value={(q.options ?? []).join(", ")}
                placeholder="보기를 쉼표로 나눠 적어요 (예: 매우 좋음, 보통, 별로)"
                aria-label="보기"
                onChange={(e) => update(i, { options: e.target.value.split(",") })}
              />
            </div>
          )}
        </fieldset>
      ))}
      {questions.length < 10 && (
        <button className="button small admin-spaced" onClick={() => setQuestions((list) => [...list, blankQuestion(Math.max(0, ...list.map((q) => Number(q.id.slice(1)) || 0)) + 1)])}>
          질문 더하기
        </button>
      )}
      {message && <p className="nickname-note">{message}</p>}
      <button className="button primary wide admin-spaced" disabled={busy} onClick={() => void save()}>
        저장 (꺼진 채로 저장돼요)
      </button>
    </div>
  );
}
