"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GRADES, STUDENT_STATUSES } from "../src/types.ts";
import type { SchoolOption } from "../lib/filter.ts";
import { CONTACT } from "../lib/policy.ts";
import { disablePush, enablePush, needsInstallForPush } from "../lib/push.ts";
import { supabase, useUser } from "../lib/user.tsx";
import type { Profile } from "../lib/user.tsx";
import { ChevronIcon } from "./Icons.tsx";

interface Props {
  schools: SchoolOption[];
  fieldTags: string[]; // 관심 분야로 고를 수 있는 태그
  seriesInfo: Record<string, [title: string, currentId: string | null]>; // 댓글이 달린 프로그램 이름·주소
}

interface MyComment {
  id: number;
  series_id: string;
  body: string;
  created_at: string;
}

const NICKNAME = /^.{2,12}$/u;

// 프로필: 계정, 내 학교·신분·학년, 관심 분야, 알림, 숨긴 사용자, 약관, 회원 탈퇴
export function MyAccount({ schools, fieldTags, seriesInfo }: Props) {
  const user = useUser();
  const router = useRouter();
  const { profile } = user;
  const [blockCount, setBlockCount] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savedLocally, setSavedLocally] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameNote, setNicknameNote] = useState<string | null>(null);
  const [myComments, setMyComments] = useState<MyComment[] | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);

  useEffect(() => setNickname(profile.nickname ?? ""), [profile.nickname]);

  // 내가 쓴 댓글 (최근 50개)
  const loadMyComments = useCallback(async () => {
    if (!supabase || !user.userId) return;
    const { data, error } = await supabase
      .from("comment_feed")
      .select("id, series_id, body, created_at")
      .eq("mine", true)
      .order("created_at", { ascending: false })
      .limit(50);
    setMyComments(error ? null : (data as MyComment[]));
  }, [user.userId]);

  useEffect(() => {
    void loadMyComments();
  }, [loadMyComments]);

  async function saveNickname(event: React.FormEvent) {
    event.preventDefault();
    const value = nickname.trim();
    if (value && !NICKNAME.test(value)) {
      setNicknameNote("닉네임은 2~12자로 정해 주세요.");
      return;
    }
    const saved = await user.setProfile({ nickname: value || null });
    setNicknameNote(saved ? (value ? "닉네임을 저장했어요." : "닉네임을 지웠어요. 댓글에 익명으로 보여요.") : "닉네임을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  async function removeComment(id: number) {
    if (!supabase || !window.confirm("댓글을 지울까요?")) return;
    await supabase.rpc("delete_my_comment", { target: id });
    void loadMyComments();
  }

  useEffect(() => {
    if (!supabase || !user.userId) return;
    void supabase
      .from("blocks")
      .select("blocked_id", { count: "exact", head: true })
      .then(({ count, error }) => setBlockCount(error ? null : (count ?? 0)));
  }, [user.userId]);

  // 계정에 저장하지 못하면(설정 표를 아직 안 만듦 등) 이 기기에만 저장됐다고 알린다
  async function update(patch: Partial<Profile>) {
    const saved = await user.setProfile(patch);
    setSavedLocally(!saved);
  }

  // 마감 알림: 켜면 이 기기의 알림 권한을 받아 알림 받을 주소를 저장한다 (lib/push.ts)
  async function toggleDeadline(on: boolean) {
    if (!supabase || !user.userId) return;
    setPushBusy(true);
    const result = on ? await enablePush(supabase, user.userId) : await disablePush(supabase);
    setPushBusy(false);
    if (on && result !== "on") {
      setPushNote(
        result === "denied"
          ? "알림이 차단돼 있어요. 브라우저 주소창 왼쪽의 사이트 설정에서 알림을 허용해 주세요."
          : result === "unsupported"
            ? needsInstallForPush()
              ? "아이폰은 공유 버튼 → '홈 화면에 추가'로 설치한 앱에서 알림을 켤 수 있어요."
              : "이 브라우저는 알림을 지원하지 않아요."
            : "알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
    setPushNote(on ? "알림을 켰어요. 관심 공고 마감 하루 전에 이 기기로 알려 드려요." : "알림을 껐어요.");
    await update({ notifyDeadline: on });
  }

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

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

  return (
    <div className="my">
      <section className="card my-card">
        {!user.loginEnabled ? (
          <>
            <h2 className="card-title">체험 모드</h2>
            <p className="card-sub">로그인 없이 이 브라우저에만 설정과 관심 공고를 저장하고 있어요.</p>
          </>
        ) : !user.ready ? (
          <p className="card-sub">불러오는 중…</p>
        ) : user.signedIn ? (
          <>
            <h2 className="card-title">{user.email ?? "소셜 계정으로 로그인했어요"}</h2>
            <p className="card-sub">관심 공고 {user.favorites.size}개 · 설정이 계정에 저장돼요</p>
            <form className="nickname-form" onSubmit={saveNickname}>
              <label htmlFor="nickname" className="my-label">
                닉네임
              </label>
              <div className="nickname-row">
                <input
                  id="nickname"
                  value={nickname}
                  maxLength={12}
                  placeholder="비워 두면 익명"
                  onChange={(event) => setNickname(event.target.value)}
                />
                <button className="button small" disabled={nickname.trim() === (profile.nickname ?? "")}>
                  저장
                </button>
              </div>
              <p className="nickname-note" role="status">
                {nicknameNote ?? "닉네임은 내 댓글에 함께 보여요. 실명은 쓰지 마세요."}
              </p>
            </form>
            <button className="button wide" onClick={user.signOut}>
              로그아웃
            </button>
          </>
        ) : (
          <>
            <h2 className="card-title">로그인하지 않았어요</h2>
            <p className="card-sub">로그인하면 설정과 관심 공고를 어느 기기에서든 볼 수 있어요.</p>
            <button className="button primary wide" onClick={() => user.setLoginOpen(true)}>
              로그인
            </button>
          </>
        )}
      </section>

      <section className="card my-card">
        <h2 className="card-title">내 정보</h2>
        <p className="card-sub">고른 대로 공고 목록의 학교·대상 필터가 처음부터 맞춰져요.</p>

        <h3 className="my-label">학교</h3>
        <div className="my-options">
          <button className={`tag-option ${user.schoolId === null ? "on" : ""}`} onClick={() => user.setSchool(null)}>
            전체 학교
          </button>
          {schools.map((s) => (
            <button key={s.id} className={`tag-option ${user.schoolId === s.id ? "on" : ""}`} onClick={() => user.setSchool(s.id)}>
              {s.name}
            </button>
          ))}
        </div>

        <h3 className="my-label">신분</h3>
        <div className="my-options">
          {STUDENT_STATUSES.map((s) => (
            <button
              key={s}
              className={`tag-option ${profile.status === s ? "on" : ""}`}
              aria-pressed={profile.status === s}
              onClick={() => update({ status: profile.status === s ? null : s })}
            >
              {s}
            </button>
          ))}
        </div>

        {profile.status !== "졸업생" && (
          <>
            <h3 className="my-label">학년</h3>
            <div className="my-options">
              {GRADES.map((g) => (
                <button
                  key={g}
                  className={`tag-option ${profile.grade === g ? "on" : ""}`}
                  aria-pressed={profile.grade === g}
                  onClick={() => update({ grade: profile.grade === g ? null : g })}
                >
                  {g}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card my-card">
        <h2 className="card-title">관심 분야</h2>
        <p className="card-sub">고른 분야의 공고를 홈에서 따로 모아 보여 드려요.</p>
        <div className="my-options spaced">
          {fieldTags.map((tag) => (
            <button
              key={tag}
              className={`tag-option ${profile.interests.includes(tag) ? "on" : ""}`}
              aria-pressed={profile.interests.includes(tag)}
              onClick={() => update({ interests: toggle(profile.interests, tag) })}
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      <section className="card my-card">
        <label className="my-switch">
          <span>
            <strong>마감 알림</strong>
            <small>
              관심 공고 모집 마감 하루 전 아침 9시에 이 기기로 알려 드려요.
              {!user.signedIn && " 로그인하면 켤 수 있어요."}
            </small>
          </span>
          <input
            type="checkbox"
            checked={user.signedIn && profile.notifyDeadline}
            disabled={!user.signedIn || pushBusy}
            onChange={(event) => void toggleDeadline(event.target.checked)}
          />
        </label>
        {pushNote && (
          <p className="nickname-note" role="status">
            {pushNote}
          </p>
        )}
      </section>

      {savedLocally && (
        <p className="my-message" role="status">
          이 기기에만 저장됐어요. 계정 저장은 준비 중이에요.
        </p>
      )}

      {user.signedIn && myComments && (
        <section className="card my-card">
          <h2 className="card-title">내 댓글</h2>
          {myComments.length === 0 ? (
            <p className="card-sub">아직 쓴 댓글이 없어요.</p>
          ) : (
            <ul className="my-comments">
              {myComments.map((comment) => {
                const [title, currentId] = seriesInfo[comment.series_id] ?? ["지난 프로그램", null];
                return (
                  <li key={comment.id}>
                    <div className="my-comment-head">
                      {currentId ? <Link href={`/programs/${currentId}`}>{title}</Link> : <span>{title}</span>}
                      <button className="text-button" onClick={() => removeComment(comment.id)}>
                        삭제
                      </button>
                    </div>
                    <p>{comment.body}</p>
                    <time>{new Date(comment.created_at).toLocaleDateString("ko-KR")}</time>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

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
        <a href={CONTACT.href}>
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
