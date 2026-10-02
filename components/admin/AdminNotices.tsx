"use client";

import { useCallback, useEffect, useState } from "react";
import { describeError, formatDateTime } from "../../lib/admin.ts";
import type { Announcement } from "../../lib/admin.ts";
import { supabase } from "../../lib/user.tsx";

// 사이트 공지: 켜 둔 공지가 모든 화면 맨 위에 보인다 (components/SiteNotice.tsx). 여러 개가 켜져 있으면 가장 최근 것 하나만
export function AdminNotices() {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [level, setLevel] = useState<"info" | "warn">("info");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(50);
    setRows(error ? null : (data as Announcement[]));
    setError(error ? describeError(error) : null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !body.trim()) return;
    const url = link.trim();
    if (url && !/^(https?:\/\/|\/)/.test(url)) {
      setError("링크는 https:// 또는 /로 시작해야 해요. 예: /programs");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("announcements").insert({
      body: body.trim(),
      link: url || null,
      level,
      // 날짜만 고르면 그날 끝(한국 시간 자정)까지 보인다
      ends_at: endsAt ? new Date(`${endsAt}T23:59:59+09:00`).toISOString() : null,
    });
    setBusy(false);
    setError(error ? describeError(error) : null);
    if (!error) {
      setBody("");
      setLink("");
      setEndsAt("");
      void load();
    }
  }

  async function update(id: number, patch: Partial<Announcement>) {
    if (!supabase) return;
    const { error } = await supabase.from("announcements").update(patch).eq("id", id);
    setError(error ? describeError(error) : null);
    void load();
  }

  async function remove(id: number) {
    if (!supabase || !window.confirm("공지를 지울까요?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    setError(error ? describeError(error) : null);
    void load();
  }

  const now = Date.now();
  const showing = rows?.find((a) => a.active && (!a.starts_at || Date.parse(a.starts_at) <= now) && (!a.ends_at || Date.parse(a.ends_at) > now));

  return (
    <div className="my">
      <form className="card my-card" onSubmit={create}>
        <h2 className="card-title">새 공지</h2>
        <p className="card-sub">모든 화면 맨 위에 띠로 보여요. 사람마다 닫으면 그 공지는 다시 안 보여요.</p>
        <label className="admin-field">
          <span>내용 (200자까지)</span>
          <textarea value={body} maxLength={200} rows={2} placeholder="예: 10월 5일 새벽 2~3시 점검으로 로그인이 잠시 안 돼요." onChange={(e) => setBody(e.target.value)} />
        </label>
        <label className="admin-field">
          <span>링크 (선택)</span>
          <input value={link} placeholder="/programs 또는 https://…" onChange={(e) => setLink(e.target.value)} />
        </label>
        <label className="admin-field">
          <span>마지막 날 (선택, 비우면 끌 때까지)</span>
          <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
        <div className="my-options spaced">
          <button type="button" className={`tag-option ${level === "info" ? "on" : ""}`} aria-pressed={level === "info"} onClick={() => setLevel("info")}>
            안내 (파랑)
          </button>
          <button type="button" className={`tag-option ${level === "warn" ? "on" : ""}`} aria-pressed={level === "warn"} onClick={() => setLevel("warn")}>
            중요 (빨강)
          </button>
        </div>
        {body.trim() && (
          <div className={`site-notice ${level} admin-preview`}>
            <span>{body.trim()}</span>
          </div>
        )}
        <button className="button primary wide" disabled={busy || !body.trim()}>
          공지 올리기
        </button>
      </form>

      {error && <p className="admin-error">{error}</p>}

      <section className="card my-card">
        <h2 className="card-title">공지 목록</h2>
        <p className="card-sub">{showing ? `지금 보이는 공지: "${showing.body.slice(0, 30)}"` : "지금 보이는 공지가 없어요."}</p>
        {rows && rows.length > 0 && (
          <ul className="my-comments">
            {rows.map((a) => {
              const expired = a.ends_at !== null && Date.parse(a.ends_at) <= now;
              return (
                <li key={a.id}>
                  <div className="my-comment-head">
                    <span>
                      {a.level === "warn" && <span className="admin-tag warn">중요</span>}{" "}
                      {a === showing ? <strong className="accent">보이는 중</strong> : expired ? "기간 끝" : a.active ? "대기 (더 최근 공지가 보이는 중)" : "꺼짐"}
                    </span>
                    <div className="admin-actions">
                      <button className="text-button" onClick={() => update(a.id, { active: !a.active })}>
                        {a.active ? "끄기" : "켜기"}
                      </button>
                      <button className="text-button" onClick={() => remove(a.id)}>
                        삭제
                      </button>
                    </div>
                  </div>
                  <p>{a.body}</p>
                  <time>
                    {formatDateTime(a.created_at)}
                    {a.ends_at && ` ~ ${formatDateTime(a.ends_at)}`}
                    {a.link && ` · ${a.link}`}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
