"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { describeError, formatDateTime, PAGE_SIZE } from "../../lib/admin.ts";
import type { ProgramReport } from "../../lib/admin.ts";
import { supabase } from "../../lib/user.tsx";
import type { AdminContext } from "./AdminApp.tsx";
import { Pager } from "./AdminUsers.tsx";

interface Props {
  context: AdminContext;
  onChange: () => void;
}

// 정보 오류 신고 ("정보가 틀렸어요"): 공고를 열어 확인하고, 데이터를 고친 뒤 "해결함"
export function AdminReports({ context, onChange }: Props) {
  const [open, setOpen] = useState(true);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ProgramReport[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error, count } = await supabase
      .from("program_reports")
      .select("id, program_id, reason, note, created_at, resolved", { count: "exact" })
      .eq("resolved", !open)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    setRows(error ? null : (data as ProgramReport[]));
    setTotal(count ?? 0);
    setError(error ? describeError(error) : null);
  }, [open, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setResolved(report: ProgramReport, resolved: boolean) {
    if (!supabase) return;
    // 같은 공고에 들어온 다른 열린 신고도 함께 처리한다
    const { error } = await supabase.from("program_reports").update({ resolved }).eq("program_id", report.program_id).eq("resolved", !resolved);
    setError(error ? describeError(error) : null);
    onChange();
    void load();
  }

  return (
    <div className="my">
      <section className="card my-card">
        <div className="my-options">
          {[
            [true, "해결 전"],
            [false, "해결한 신고"],
          ].map(([value, label]) => (
            <button
              key={String(label)}
              className={`tag-option ${open === value ? "on" : ""}`}
              aria-pressed={open === value}
              onClick={() => {
                setPage(0);
                setOpen(value as boolean);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="card-sub">
          공고 데이터는 <code>data/programs.json</code>에 있어요. 고칠 공고 주소를 Claude에게 알려 주면 바로잡아 줘요.
        </p>
      </section>

      {error && <p className="admin-error">{error}</p>}
      {rows && rows.length === 0 && <p className="section-empty card my-card">{open ? "해결할 신고가 없어요." : "해결한 신고가 없어요."}</p>}
      {rows?.map((r) => {
        const found = context.programTitles[r.program_id];
        return (
          <section key={r.id} className="card my-card admin-feedback">
            <div className="row-meta">
              <span className="admin-tag warn">{r.reason}</span>
              <span>{formatDateTime(r.created_at)}</span>
            </div>
            {found ? (
              <Link href={`/programs/${found[1]}`} className="admin-body admin-link">
                {found[0]}
              </Link>
            ) : (
              <p className="admin-body">
                목록에 없는 공고 <span className="admin-mono">{r.program_id}</span> (보관함으로 갔거나 합쳐졌어요)
              </p>
            )}
            {r.note && <p className="admin-quote">{r.note}</p>}
            <div className="report-info-actions">
              {open ? (
                <button className="button primary small" onClick={() => setResolved(r, true)}>
                  해결함
                </button>
              ) : (
                <button className="button small" onClick={() => setResolved(r, false)}>
                  다시 열기
                </button>
              )}
            </div>
          </section>
        );
      })}
      {rows && (
        <div className="card">
          <Pager page={page} total={total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
