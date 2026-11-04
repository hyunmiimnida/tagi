"use client";

import { useEffect, useMemo, useState } from "react";
import { adminRpc } from "../../lib/admin-rpc.ts";
import { sinceOf } from "../../lib/admin.ts";
import type { Period } from "../../lib/admin.ts";
import { DEFAULT_FUNNELS, EVENT_LABELS, EVENT_NAMES, funnelRows, HEATMAP_PAGES } from "../../lib/research.ts";
import type { EventName, FunnelStep, HeatmapPage } from "../../lib/research.ts";
import type { AdminContext } from "./AdminApp.tsx";
import { AdminExperiments } from "./AdminExperiments.tsx";
import { AdminSurveys } from "./AdminSurveys.tsx";

export const RESEARCH_SQL = "research-data.sql";

const VIEWS = [
  { id: "funnel", label: "퍼널" },
  { id: "heatmap", label: "히트맵" },
  { id: "survey", label: "설문" },
  { id: "ab", label: "A/B" },
] as const;

export const PERIODS: [Period, string][] = [
  ["today", "오늘"],
  ["7", "7일"],
  ["30", "30일"],
  ["all", "전체"],
];

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  return (
    <div className="my-options">
      {PERIODS.map(([id, label]) => (
        <button key={id} className={`tag-option ${value === id ? "on" : ""}`} aria-pressed={value === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// 리서치: 이용 기록 요약, 퍼널 분석, 히트맵, 설문, A/B 테스트 (supabase/research-data.sql)
export function AdminResearch({ context }: { context: AdminContext }) {
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("funnel");
  return (
    <div className="my">
      <EventSummary />
      <nav className="my-options" aria-label="리서치 방법">
        {VIEWS.map((v) => (
          <button key={v.id} className={`tag-option ${view === v.id ? "on" : ""}`} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </nav>
      {view === "funnel" && <Funnel />}
      {view === "heatmap" && <Heatmap context={context} />}
      {view === "survey" && <AdminSurveys />}
      {view === "ab" && <AdminExperiments />}
    </div>
  );
}

interface Counts {
  names: Partial<Record<EventName, number>>;
  devices: number;
  signedIn: number;
}

function EventSummary() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void adminRpc<Counts>("admin_event_counts", { since: sinceOf("7") }, RESEARCH_SQL).then((r) => {
      setCounts(r.data);
      setError(r.error);
    });
  }, []);
  if (error) return <p className="admin-error">{error}</p>;
  if (!counts) return <p className="card-sub">불러오는 중…</p>;
  return (
    <section className="card my-card">
      <h2 className="card-title">최근 7일 이용 기록</h2>
      <div className="admin-numbers">
        <Num label="기기" value={counts.devices} />
        <Num label="로그인한 사람" value={counts.signedIn} />
        <Num label="화면 열기" value={counts.names.page_view ?? 0} />
        <Num label="원문 누르기" value={counts.names.apply_click ?? 0} />
      </div>
    </section>
  );
}

function Funnel() {
  const [period, setPeriod] = useState<Period>("30");
  const [preset, setPreset] = useState<string>(DEFAULT_FUNNELS[0].id);
  const [custom, setCustom] = useState<FunnelStep[]>([{ name: "page_view" }, { name: "program_open" }]);
  const [rows, setRows] = useState<ReturnType<typeof funnelRows> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const steps = preset === "custom" ? custom : (DEFAULT_FUNNELS.find((f) => f.id === preset)?.steps ?? []);
  const key = JSON.stringify([steps, period]);

  useEffect(() => {
    const [chosen, chosenPeriod] = JSON.parse(key) as [FunnelStep[], Period];
    if (chosen.length === 0) return;
    setRows(null);
    void adminRpc<{ name: string; path: string | null; people: number }[]>(
      "admin_funnel",
      { steps: chosen.map((s) => ({ name: s.name, ...(s.path ? { path: s.path } : {}) })), since: sinceOf(chosenPeriod) },
      RESEARCH_SQL,
    ).then((r) => {
      setRows(r.data ? funnelRows(r.data) : null);
      setError(r.error);
    });
  }, [key]);

  return (
    <section className="card my-card">
      <h2 className="card-title">퍼널 분석</h2>
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="my-options spaced">
        {DEFAULT_FUNNELS.map((f) => (
          <button key={f.id} className={`tag-option ${preset === f.id ? "on" : ""}`} aria-pressed={preset === f.id} onClick={() => setPreset(f.id)}>
            {f.label}
          </button>
        ))}
        <button className={`tag-option ${preset === "custom" ? "on" : ""}`} aria-pressed={preset === "custom"} onClick={() => setPreset("custom")}>
          직접 만들기
        </button>
      </div>
      {preset === "custom" && <StepEditor steps={custom} onChange={setCustom} />}
      {error && <p className="admin-error">{error}</p>}
      {!rows && !error && <p className="card-sub">계산하는 중…</p>}
      {rows && (
        <ol className="funnel">
          {rows.map((row, i) => (
            <li key={i}>
              <div className="admin-line">
                <span>
                  {i + 1}. {EVENT_LABELS[row.name as EventName] ?? row.name}
                  {row.path && <span className="admin-meta"> {row.path}</span>}
                </span>
                <strong>{row.people.toLocaleString("ko-KR")}명</strong>
              </div>
              <div className="funnel-bar">
                <span style={{ width: `${row.fromStart ?? 0}%` }} />
              </div>
              {i > 0 && (
                <div className="admin-meta">
                  앞 단계의 {row.fromPrev === null ? "-" : `${row.fromPrev.toFixed(1)}%`} · 빠짐 {row.dropped.toLocaleString("ko-KR")}명 · 처음 대비{" "}
                  {row.fromStart === null ? "-" : `${row.fromStart.toFixed(1)}%`}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="admin-meta admin-spaced">같은 기기가 앞 단계 다음에 그 단계를 했는지 셉니다 (기기 = 브라우저의 무작위 번호).</p>
    </section>
  );
}

const STEP_EVENTS = EVENT_NAMES.filter((n) => n !== "click" && n !== "exposure");

function StepEditor({ steps, onChange }: { steps: FunnelStep[]; onChange: (steps: FunnelStep[]) => void }) {
  const update = (i: number, step: FunnelStep) => onChange(steps.map((s, j) => (j === i ? step : s)));
  return (
    <div className="admin-spaced">
      {steps.map((step, i) => (
        <div key={i} className="nickname-row admin-spaced">
          <select value={step.name} aria-label={`${i + 1}단계`} onChange={(e) => update(i, { name: e.target.value as EventName })}>
            {STEP_EVENTS.map((n) => (
              <option key={n} value={n}>
                {i + 1}. {EVENT_LABELS[n]}
              </option>
            ))}
          </select>
          {step.name === "page_view" && (
            <input value={step.path ?? ""} placeholder="주소 (예: /programs, 비우면 모든 화면)" aria-label="주소" onChange={(e) => update(i, { ...step, path: e.target.value.trim() || undefined })} />
          )}
          {steps.length > 1 && (
            <button className="text-button" onClick={() => onChange(steps.filter((_, j) => j !== i))}>
              빼기
            </button>
          )}
        </div>
      ))}
      {steps.length < 6 && (
        <button className="button small admin-spaced" onClick={() => onChange([...steps, { name: "apply_click" }])}>
          단계 더하기
        </button>
      )}
    </div>
  );
}

interface HeatmapData {
  points: { x: number; y: number; n: number }[];
  elements: { el: string; n: number }[];
  total: number;
}

const DEVICE_WIDTH = { m: 390, d: 1280 } as const;

function Heatmap({ context }: { context: AdminContext }) {
  const [page, setPage] = useState<HeatmapPage>("/programs");
  const [device, setDevice] = useState<"m" | "d">("m");
  const [period, setPeriod] = useState<Period>("30");
  const [data, setData] = useState<HeatmapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boxWidth, setBoxWidth] = useState(320);

  useEffect(() => {
    setData(null);
    void adminRpc<HeatmapData>("admin_heatmap", { page, device, since: sinceOf(period) }, RESEARCH_SQL).then((r) => {
      setData(r.data);
      setError(r.error);
    });
  }, [page, device, period]);

  // 공고 상세는 공고마다 모양이 비슷하니 아무 공고 하나를 바탕으로 보여 준다
  const sample = useMemo(() => Object.values(context.programTitles)[0]?.[1] ?? null, [context.programTitles]);
  const src = page === "/programs/*" ? (sample ? `/programs/${sample}` : null) : page;
  const width = DEVICE_WIDTH[device];
  const scale = Math.min(1, boxWidth / width);
  const height = Math.max(1600, ...(data?.points.map((p) => p.y + 400) ?? []));
  const max = Math.max(1, ...(data?.points.map((p) => p.n) ?? []));

  return (
    <section className="card my-card">
      <h2 className="card-title">히트맵</h2>
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="my-options spaced">
        {HEATMAP_PAGES.map((p) => (
          <button key={p} className={`tag-option ${page === p ? "on" : ""}`} aria-pressed={page === p} onClick={() => setPage(p)}>
            {p === "/" ? "홈" : p === "/programs" ? "공고 목록" : "공고 상세"}
          </button>
        ))}
        <span className="segmented" role="group" aria-label="화면 너비">
          <button className={device === "m" ? "on" : ""} onClick={() => setDevice("m")}>
            휴대폰
          </button>
          <button className={device === "d" ? "on" : ""} onClick={() => setDevice("d")}>
            컴퓨터
          </button>
        </span>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {data && (
        <>
          <p className="admin-meta admin-spaced">누른 수 {data.total.toLocaleString("ko-KR")}번 · 진한 점일수록 많이 눌렀어요</p>
          <div
            className="heatmap-box"
            ref={(el) => {
              if (el && el.clientWidth !== boxWidth) setBoxWidth(el.clientWidth);
            }}
            style={{ height: height * scale }}
          >
            <div className="heatmap-stage" style={{ width, height, transform: `scale(${scale})` }}>
              {src && <iframe src={src} title="화면 미리보기" width={width} height={height} tabIndex={-1} aria-hidden="true" onLoad={showAllRows} />}
              {data.points.map((p, i) => (
                <span
                  key={i}
                  className="heatmap-dot"
                  style={{ left: p.x * width, top: p.y, opacity: 0.25 + (0.75 * p.n) / max, width: 16 + (24 * p.n) / max, height: 16 + (24 * p.n) / max }}
                  title={`${p.n}번`}
                />
              ))}
            </div>
          </div>
          {data.elements.length > 0 && (
            <table className="admin-grid">
              <thead>
                <tr>
                  <th>요소 (data-hm)</th>
                  <th>누른 수</th>
                </tr>
              </thead>
              <tbody>
                {data.elements.map((e) => (
                  <tr key={e.el}>
                    <td>{e.el || "(이름 없음)"}</td>
                    <td>{e.n.toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

// 미리보기 안의 공고 목록은 화면 밖이라고 그리지 않고 넘어가서(content-visibility), 미리보기 안에서만 모두 그리게 한다
function showAllRows(event: React.SyntheticEvent<HTMLIFrameElement>) {
  try {
    const doc = event.currentTarget.contentDocument;
    if (!doc) return;
    const style = doc.createElement("style");
    style.textContent = ".row { content-visibility: visible !important; }";
    doc.head.append(style);
  } catch {
    // 미리보기를 고치지 못해도 점은 그대로 보인다
  }
}

export function Num({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="admin-num">
      <span>{label}</span>
      <strong>{value.toLocaleString("ko-KR")}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}
