"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRpc } from "../../lib/admin-rpc.ts";
import { describeError, formatDateTime } from "../../lib/admin.ts";
import { compareVariants, EVENT_LABELS, EVENT_NAMES, MIN_EXPOSED, parseVariants } from "../../lib/research.ts";
import type { Comparison, EventName, Variant, VariantResult } from "../../lib/research.ts";
import { supabase } from "../../lib/user.tsx";
import { RESEARCH_SQL } from "./AdminResearch.tsx";

interface Experiment {
  id: string;
  variants: Variant[];
  goal: EventName;
  note: string | null;
  active: boolean;
  created_at: string;
}

const VERDICTS: Record<Comparison["verdict"], string> = {
  baseline: "기준",
  early: "아직 판단하기 일러요",
  same: "차이가 우연일 수 있어요",
  better: "기준보다 좋아요",
  worse: "기준보다 나빠요",
};

// A/B 테스트: 실험 만들기·켜기/끄기, 변형마다 노출 수·목표 달성률·차이의 신뢰 정도 (화면에 붙이는 방법은 CLAUDE.md)
export function AdminExperiments() {
  const [list, setList] = useState<Experiment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("experiments").select("*").order("created_at", { ascending: false });
    setList(error ? null : (data as Experiment[]));
    setError(error ? describeError(error, RESEARCH_SQL) : null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setActive(row: Experiment, active: boolean) {
    if (!supabase) return;
    const { error } = await supabase.from("experiments").update({ active }).eq("id", row.id);
    if (error) setError(describeError(error, RESEARCH_SQL));
    void load();
  }

  return (
    <section className="card my-card">
      <div className="admin-line">
        <h2 className="card-title">A/B 테스트</h2>
        <button className="button small" onClick={() => setCreating((v) => !v)}>
          {creating ? "닫기" : "새 실험"}
        </button>
      </div>
      <p className="admin-meta">실험은 화면 코드에 useVariant(&quot;실험 이름&quot;)을 붙인 곳에서만 돌아요 (CLAUDE.md &ldquo;A/B 테스트&rdquo;).</p>
      {creating && (
        <ExperimentEditor
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
      {error && <p className="admin-error">{error}</p>}
      {list && list.length === 0 && !creating && <p className="card-sub">아직 만든 실험이 없어요.</p>}
      {list && list.length > 0 && (
        <ul className="admin-list">
          {list.map((e) => (
            <li key={e.id}>
              <div className="admin-line">
                <button className="link-button" onClick={() => setOpened(opened === e.id ? null : e.id)}>
                  <strong>{e.id}</strong>
                </button>
                <label className="my-switch">
                  <span className="admin-meta">{e.active ? "켜짐" : "꺼짐"}</span>
                  <input type="checkbox" checked={e.active} onChange={(ev) => void setActive(e, ev.target.checked)} />
                </label>
              </div>
              <div className="admin-meta">
                {e.variants.map((v) => `${v.name} ${v.weight}`).join(" · ")} · 목표 {EVENT_LABELS[e.goal] ?? e.goal} · {formatDateTime(e.created_at)}
                {e.note && ` · ${e.note}`}
              </div>
              {opened === e.id && <ExperimentResults id={e.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExperimentResults({ id }: { id: string }) {
  const [rows, setRows] = useState<Comparison[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void adminRpc<VariantResult[]>("admin_experiment_results", { target: id }, RESEARCH_SQL).then((r) => {
      setRows(r.data ? compareVariants(r.data) : null);
      setError(r.error);
    });
  }, [id]);
  if (error) return <p className="admin-error">{error}</p>;
  if (!rows) return <p className="card-sub">불러오는 중…</p>;
  if (rows.length === 0) return <p className="card-sub">아직 노출 기록이 없어요.</p>;
  return (
    <>
      <table className="admin-grid">
        <thead>
          <tr>
            <th>변형</th>
            <th>노출</th>
            <th>달성</th>
            <th>달성률</th>
            <th>차이</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.variant}>
              <td>{r.variant}</td>
              <td>{r.exposed.toLocaleString("ko-KR")}</td>
              <td>{r.converted.toLocaleString("ko-KR")}</td>
              <td>{r.rate === null ? "-" : `${r.rate.toFixed(1)}%`}</td>
              <td>{r.diff === null ? "-" : `${r.diff > 0 ? "+" : ""}${r.diff.toFixed(1)}%p`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.slice(1).map((r) => (
        <p key={r.variant} className={`admin-meta ${r.verdict === "better" ? "admin-plus" : r.verdict === "worse" ? "warn" : ""}`}>
          {r.variant}: {VERDICTS[r.verdict]}
          {r.p !== null && r.verdict !== "early" && ` (우연일 확률 ${(r.p * 100).toFixed(1)}%)`}
          {r.verdict === "early" && ` (변형마다 ${MIN_EXPOSED}명 넘게 노출되면 판단해요)`}
        </p>
      ))}
    </>
  );
}

function ExperimentEditor({ onSaved }: { onSaved: () => void }) {
  const [id, setId] = useState("");
  const [variants, setVariants] = useState("a:50, b:50");
  const [goal, setGoal] = useState<EventName>("apply_click");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const parsed = parseVariants(variants);
    if (!/^[a-z0-9-]{2,40}$/.test(id)) return setMessage("실험 이름은 영어 소문자·숫자·-로 2~40자예요 (예: apply-button).");
    if (parsed.length < 2 || parsed.length > 5 || parsed.some((v) => !v.name || !(v.weight > 0))) {
      return setMessage("변형은 2~5개, \"이름:비율\"을 쉼표로 나눠 적어요 (예: a:50, b:50).");
    }
    if (!supabase) return;
    const { error } = await supabase.from("experiments").insert({ id, variants: parsed, goal, note: note.trim() || null, active: false });
    if (error) return setMessage(describeError(error, RESEARCH_SQL));
    onSaved();
  }

  return (
    <div className="admin-spaced">
      <div className="nickname-row admin-spaced">
        <input value={id} placeholder="실험 이름 (코드의 useVariant와 같게)" aria-label="실험 이름" onChange={(e) => setId(e.target.value.trim())} />
      </div>
      <div className="nickname-row admin-spaced">
        <input value={variants} placeholder="변형 (예: a:50, b:50)" aria-label="변형과 비율" onChange={(e) => setVariants(e.target.value)} />
      </div>
      <div className="nickname-row admin-spaced">
        <select value={goal} aria-label="목표 기록" onChange={(e) => setGoal(e.target.value as EventName)}>
          {EVENT_NAMES.filter((n) => n !== "exposure" && n !== "click").map((n) => (
            <option key={n} value={n}>
              목표: {EVENT_LABELS[n]}
            </option>
          ))}
        </select>
      </div>
      <div className="nickname-row admin-spaced">
        <input value={note} maxLength={300} placeholder="메모 (무엇을 바꿨는지)" aria-label="메모" onChange={(e) => setNote(e.target.value)} />
      </div>
      {message && <p className="nickname-note">{message}</p>}
      <button className="button primary wide admin-spaced" onClick={() => void save()}>
        저장 (꺼진 채로 저장돼요)
      </button>
    </div>
  );
}
