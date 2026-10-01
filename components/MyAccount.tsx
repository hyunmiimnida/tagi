"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CONTACT } from "../lib/policy.ts";
import { supabase, useUser } from "../lib/user.tsx";
import { ChevronIcon } from "./Icons.tsx";

// 내 정보: 로그인 계정, 숨긴 사용자, 로그아웃·회원 탈퇴, 약관 링크
export function MyAccount({ schoolNames }: { schoolNames: Record<string, string> }) {
  const user = useUser();
  const router = useRouter();
  const [blockCount, setBlockCount] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!supabase || !user.userId) return;
    void supabase
      .from("blocks")
      .select("blocked_id", { count: "exact", head: true })
      .then(({ count, error }) => setBlockCount(error ? null : (count ?? 0)));
  }, [user.userId]);

  async function unblockAll() {
    if (!supabase || !user.userId || !window.confirm("숨긴 사람들의 글을 다시 볼까요?")) return;
    const { error } = await supabase.from("blocks").delete().eq("user_id", user.userId);
    if (error) setMessage("다시 보이게 하지 못했어요. 잠시 후 다시 시도해 주세요.");
    else setBlockCount(0);
  }

  async function deleteAccount() {
    const ok = window.confirm(
      "탈퇴하면 학교 설정, 관심 공고, 내가 쓴 댓글이 모두 지워지고 되돌릴 수 없어요. 탈퇴할까요?",
    );
    if (!ok) return;
    setDeleting(true);
    const done = await user.deleteAccount();
    setDeleting(false);
    if (!done) {
      setMessage("탈퇴하지 못했어요. 잠시 후 다시 시도하거나 문의해 주세요.");
      return;
    }
    window.alert("탈퇴했어요. 그동안 이용해 주셔서 고마워요.");
    router.push("/");
  }

  const school = user.schoolId ? (schoolNames[user.schoolId] ?? user.schoolId) : "전체 학교";

  return (
    <div className="my">
      <section className="card my-card">
        {!user.loginEnabled ? (
          <>
            <h2 className="card-title">체험 모드</h2>
            <p className="card-sub">로그인 없이 이 브라우저에만 학교 설정과 관심 공고를 저장하고 있어요.</p>
          </>
        ) : !user.ready ? (
          <p className="card-sub">불러오는 중…</p>
        ) : user.signedIn ? (
          <>
            <h2 className="card-title">{user.email ?? "소셜 계정으로 로그인했어요"}</h2>
            <p className="card-sub">내 학교: {school} · 관심 공고 {user.favorites.size}개</p>
            <button className="button wide" onClick={user.signOut}>
              로그아웃
            </button>
          </>
        ) : (
          <>
            <h2 className="card-title">로그인하지 않았어요</h2>
            <p className="card-sub">로그인하면 관심 공고와 학교 설정을 어느 기기에서든 볼 수 있어요.</p>
            <button className="button primary wide" onClick={() => user.setLoginOpen(true)}>
              로그인
            </button>
          </>
        )}
      </section>

      {user.signedIn && blockCount !== null && (
        <section className="card my-card">
          <h2 className="card-title">숨긴 사용자</h2>
          <p className="card-sub">
            {blockCount === 0 ? "숨긴 사람이 없어요." : `${blockCount}명의 댓글을 숨기고 있어요.`}
          </p>
          {blockCount > 0 && (
            <button className="button wide" onClick={unblockAll}>
              모두 다시 보기
            </button>
          )}
        </section>
      )}

      <nav className="card my-links" aria-label="안내">
        <Link href="/terms">
          이용약관 <ChevronIcon size={18} />
        </Link>
        <Link href="/privacy">
          개인정보처리방침 <ChevronIcon size={18} />
        </Link>
        <a href={CONTACT.href} target="_blank" rel="noreferrer">
          문의하기 <ChevronIcon size={18} />
        </a>
      </nav>

      {message && (
        <p className="my-message" role="alert">
          {message}
        </p>
      )}

      {user.signedIn && (
        <button className="my-delete" onClick={deleteAccount} disabled={deleting}>
          {deleting ? "탈퇴하는 중…" : "회원 탈퇴"}
        </button>
      )}
    </div>
  );
}
