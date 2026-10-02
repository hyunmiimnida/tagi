"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, useUser } from "../lib/user.tsx";

// 프로필의 "의견 보내기": 버그·제안을 운영자에게 보낸다 (supabase/admin.sql의 feedback).
// 로그인하면 내가 보낸 의견과 운영자 답장을 여기서 본다
const CATEGORIES = [
  { id: "버그", label: "안 돼요 (버그)" },
  { id: "제안", label: "이런 게 있으면 좋겠어요" },
  { id: "기타", label: "기타" },
];
const STATUS: Record<string, string> = { new: "보냄", doing: "확인 중", done: "완료" };
const NOTICES: Record<string, string> = {
  suspended: "이용이 정지된 계정이라 의견을 보낼 수 없어요.",
  too_many: "의견을 너무 많이 보냈어요. 잠시 후 다시 보내 주세요.",
};

interface MyFeedback {
  id: number;
  category: string;
  body: string;
  status: string;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
}

export function FeedbackBox() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyFeedback[]>([]);
  // supabase/admin.sql을 실행하기 전에는 의견을 받을 표가 없으니 상자를 숨긴다 (is_admin 함수가 있으면 실행한 것)
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void supabase?.rpc("is_admin").then(({ error }) => setReady(!error));
  }, []);

  const load = useCallback(async () => {
    if (!supabase || !user.userId) return setMine([]);
    const { data, error } = await supabase.from("my_feedback").select("*").order("created_at", { ascending: false }).limit(20);
    setMine(error ? [] : (data as MyFeedback[]));
  }, [user.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!supabase || !ready) return null;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !category) return;
    if (body.trim().length < 5) {
      setError("5자 넘게 적어 주세요.");
      return;
    }
    setState("sending");
    const { error } = await supabase.from("feedback").insert({ category, body: body.trim(), page: "프로필" });
    if (error) {
      const reason = error.message.match(/spam:(\w+)/)?.[1];
      setError((reason && NOTICES[reason]) ?? "보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      setState("idle");
      return;
    }
    setState("done");
    setError(null);
    setBody("");
    setCategory(null);
    setOpen(false);
    void load();
  }

  const replied = mine.filter((f) => f.reply).length;

  return (
    <section className="card my-card" id="my-feedback">
      <div className="my-section-head">
        <h2 className="card-title">의견 보내기</h2>
        {replied > 0 && <span className="admin-tag accent-tag">답장 {replied}</span>}
      </div>
      <p className="card-sub">
        안 되는 기능, 있었으면 하는 기능, 빠진 학교·게시판을 알려 주세요.
        {user.signedIn ? " 답장은 여기에 보여 드려요." : " 로그인하고 보내면 답장을 받을 수 있어요."}
      </p>
      {state === "done" && !open && (
        <p className="nickname-note" role="status">
          보내 주셔서 고마워요. 꼼꼼히 읽어 볼게요.
        </p>
      )}

      {!open ? (
        <button className="button wide" onClick={() => setOpen(true)}>
          의견 쓰기
        </button>
      ) : (
        <form onSubmit={send}>
          <div className="my-options spaced">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`tag-option ${category === c.id ? "on" : ""}`}
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <textarea
            className="feedback-text"
            value={body}
            maxLength={1000}
            rows={4}
            placeholder={category === "버그" ? "어느 화면에서 무엇을 눌렀을 때 어떻게 안 되는지 적어 주세요." : "자유롭게 적어 주세요."}
            aria-label="의견 내용"
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="nickname-note">이름·전화번호 같은 개인정보는 적지 마세요.</p>
          {error && <p className="report-info-error">{error}</p>}
          <div className="report-info-actions">
            <button type="button" className="text-button" onClick={() => setOpen(false)}>
              취소
            </button>
            <button className="button primary small" disabled={!category || state === "sending"}>
              {state === "sending" ? "보내는 중" : "보내기"}
            </button>
          </div>
        </form>
      )}

      {mine.length > 0 && (
        <>
          <h3 className="my-label">내가 보낸 의견</h3>
          <ul className="my-comments">
            {mine.map((f) => (
              <li key={f.id}>
                <div className="my-comment-head">
                  <span>{f.category}</span>
                  <span className={f.status === "done" ? "accent" : undefined}>{STATUS[f.status] ?? f.status}</span>
                </div>
                <p>{f.body}</p>
                <time>{new Date(f.created_at).toLocaleDateString("ko-KR")}</time>
                {f.reply && (
                  <div className="feedback-reply">
                    <strong>운영자 답장</strong>
                    <p>{f.reply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
