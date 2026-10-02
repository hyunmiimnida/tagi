"use client";

import { useCallback, useEffect, useState } from "react";
import { describeError, formatDateTime, PAGE_SIZE } from "../../lib/admin.ts";
import type { AdminLogEntry } from "../../lib/admin.ts";
import { supabase } from "../../lib/user.tsx";
import { Pager } from "./AdminUsers.tsx";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// 관리 기록: 정지·닉네임 지우기·댓글 처리·강제 탈퇴를 누가 언제 했는지
export function AdminLog({ openUser }: { openUser: (id: string) => void }) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AdminLogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error, count } = await supabase
      .from("admin_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    setRows(error ? null : (data as AdminLogEntry[]));
    setTotal(count ?? 0);
    setError(error ? describeError(error) : null);
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="my">
      {error && <p className="admin-error">{error}</p>}
      <section className="card admin-table">
        {rows && rows.length === 0 ? (
          <p className="section-empty">아직 기록이 없어요.</p>
        ) : (
          <ul className="rows">
            {rows?.map((r) => (
              <li key={r.id} className="row">
                <div className="row-body">
                  <div className="row-meta">
                    <span>{formatDateTime(r.created_at)}</span>
                  </div>
                  <strong>{r.action}</strong>
                  <div className="admin-meta">
                    {r.target && UUID.test(r.target) ? (
                      <button className="link-button" onClick={() => openUser(r.target!)}>
                        회원 보기
                      </button>
                    ) : (
                      r.target
                    )}
                    {r.detail && ` · ${r.detail}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} total={total} onPage={setPage} />
      </section>
    </div>
  );
}
