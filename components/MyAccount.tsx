"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { GRADES, STUDENT_STATUSES } from "../src/types.ts";
import { daysUntil, formatDate, isCurrent, recruitWord, upcomingEvents } from "../lib/filter.ts";
import type { ProgramView, SchoolOption } from "../lib/filter.ts";
import { downloadIcs } from "../lib/ics.ts";
import { CONTACT } from "../lib/policy.ts";
import { disablePush, enablePush, needsInstallForPush, pushOnThisDevice } from "../lib/push.ts";
import { canInstall, install, subscribeInstall } from "../lib/pwa.ts";
import { useListPrograms, useSeriesInfo } from "../lib/use-list.ts";
import { LOGIN_PROVIDERS, supabase, useToday, useUser } from "../lib/user.tsx";
import type { Profile } from "../lib/user.tsx";
import { FeedbackBox } from "./FeedbackBox.tsx";
import { CalendarPlusIcon, ChevronIcon, ProfileIcon } from "./Icons.tsx";

interface Props {
  schools: SchoolOption[];
  fieldTags: string[]; // 관심 분야로 고를 수 있는 태그
  sources: string; // 모으는 곳 요약 (예: "영남대학교·경북대학교… 공지 40곳")
}

interface MyComment {
  id: number;
  series_id: string;
  body: string;
  created_at: string;
}

const NICKNAME = /^.{2,12}$/u;
const SOON_DAYS = 7; // "곧 마감"으로 셀 기간

// 프로필: 머리(닉네임·활동 수), 맞춤 설정 안내, 다가오는 내 일정, 내 정보, 관심 분야, 알림·캘린더, 내 댓글, 숨긴 사용자, 안내, 계정
export function MyAccount({ schools, fieldTags, sources }: Props) {
  const user = useUser();
  const router = useRouter();
  const today = useToday();
  // 관심 공고 일정·관심 분야 공고 수: 아직 볼 만한 공고만 (목록 데이터는 홈·공고 화면과 같이 쓴다)
  const { programs: loaded } = useListPrograms();
  const programs: ProgramView[] = useMemo(() => (loaded && today ? loaded.filter((p) => isCurrent(p, today)) : []), [loaded, today]);
  const { profile } = user;
  const [blockCount, setBlockCount] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savedLocally, setSavedLocally] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameNote, setNicknameNote] = useState<string | null>(null);
  const [myComments, setMyComments] = useState<MyComment[] | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const installable = useSyncExternalStore(subscribeInstall, canInstall, () => false);

  useEffect(() => setNickname(profile.nickname ?? ""), [profile.nickname]);

  // 다른 기기에서 알림을 켰다면 이 기기는 아직 알림을 받지 않는다 → "이 기기에서도 받기"를 보여 준다
  const [otherDevice, setOtherDevice] = useState(false);
  useEffect(() => {
    if (!user.signedIn || !profile.notifyDeadline) return setOtherDevice(false);
    void pushOnThisDevice().then((here) => setOtherDevice(!here));
  }, [user.signedIn, profile.notifyDeadline]);

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
  // 댓글이 어느 프로그램에 달렸는지: 댓글이 있을 때만 받는다
  const seriesInfo = useSeriesInfo(Boolean(myComments && myComments.length > 0));

  // 관리자 계정이면 "관리자 화면" 링크를 보여 준다 (supabase/admin.sql을 아직 실행하지 않았으면 오류 → 안 보임)
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!supabase || !user.userId) return setIsAdmin(false);
    void supabase.rpc("is_admin").then(({ data, error }) => setIsAdmin(!error && data === true));
  }, [user.userId]);

  useEffect(() => {
    if (!supabase || !user.userId) return;
    void supabase
      .from("blocks")
      .select("blocked_id", { count: "exact", head: true })
      .then(({ count, error }) => setBlockCount(error ? null : (count ?? 0)));
  }, [user.userId]);

  // 관심 공고: 지금 목록에 있는 것만 일정을 계산한다 (보관함으로 간 공고는 캘린더의 "지난 관심 공고"에 있다)
  const favoritePrograms = useMemo(() => programs.filter((p) => user.favorites.has(p.id)), [programs, user.favorites]);
  const events = useMemo(() => (today ? upcomingEvents(programs, user.favorites, today) : []), [programs, user.favorites, today]);
  const soonCount = today
    ? favoritePrograms.filter((p) => p.recruitPeriod.end && daysUntil(p.recruitPeriod.end, today) >= 0 && daysUntil(p.recruitPeriod.end, today) <= SOON_DAYS).length
    : 0;
  const interestCount = useMemo(
    () => (today ? programs.filter((p) => p.tags.some((t) => profile.interests.includes(t)) && !(p.recruitPeriod.end && p.recruitPeriod.end < today)).length : 0),
    [programs, profile.interests, today],
  );
  const interestHref = `/programs?${profile.interests.map((t) => `tag=${encodeURIComponent(t)}`).join("&")}&sort=recent`;

  // 맞춤 추천에 쓰는 설정이 얼마나 채워졌는지
  const steps = [
    { id: "my-info", label: "내 학교", done: user.schoolId !== null },
    { id: "my-info", label: "신분·학년", done: profile.status !== null },
    { id: "my-interests", label: "관심 분야", done: profile.interests.length > 0 },
  ];
  const remaining = steps.filter((step) => !step.done);

  async function saveNickname(event: React.FormEvent) {
    event.preventDefault();
    const value = nickname.trim();
    if (value && !NICKNAME.test(value)) {
      setNicknameNote("닉네임은 2~12자로 정해 주세요.");
      return;
    }
    const saved = await user.setProfile({ nickname: value || null });
    setNicknameNote(saved ? (value ? "닉네임을 저장했어요." : "닉네임을 지웠어요. 댓글에 익명으로 보여요.") : "닉네임을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    if (saved) setEditingName(false);
  }

  async function removeComment(id: number) {
    if (!supabase || !window.confirm("댓글을 지울까요?")) return;
    await supabase.rpc("delete_my_comment", { target: id });
    void loadMyComments();
  }

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
    if (on) setOtherDevice(false);
    setPushNote(on ? "알림을 켰어요. 방금 확인 알림이 왔다면 이 기기로 잘 받을 수 있어요." : "알림을 껐어요.");
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

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const providerName = LOGIN_PROVIDERS.find((p) => p.id === user.provider)?.name;
  const schoolName = schools.find((s) => s.id === user.schoolId)?.name ?? "전체 학교";
  const whoText = [profile.status, profile.status !== "졸업생" ? profile.grade : null].filter(Boolean).join(" ") || "선택 안 함";
  const year = today ? Number(today.slice(0, 4)) : new Date().getFullYear();
  const guest = user.loginEnabled && user.ready && !user.signedIn; // 로그인을 쓸 수 있는데 아직 안 함

  return (
    <div className="my">
      {/* 1. 머리: 누구인지 + 내 활동 */}
      <section className="card my-card my-head">
        <div className="my-identity">
          <div className="my-avatar" aria-hidden="true">
            {user.signedIn && profile.nickname ? profile.nickname.slice(0, 1) : <ProfileIcon size={28} />}
          </div>
          <div className="my-identity-text">
            {!user.loginEnabled || (user.ready && !user.signedIn) ? (
              <>
                <strong>{user.loginEnabled ? "로그인하지 않았어요" : "체험 모드"}</strong>
                <span>{user.loginEnabled ? "학교·관심 분야 설정은 이 기기에 저장돼요" : "설정과 관심 공고를 이 기기에만 저장하고 있어요"}</span>
              </>
            ) : !user.ready ? (
              <strong>불러오는 중…</strong>
            ) : (
              <>
                <strong>
                  {profile.nickname ?? "익명"}
                  <button className="link-button my-edit" onClick={() => setEditingName((v) => !v)}>
                    {editingName ? "닫기" : profile.nickname ? "닉네임 바꾸기" : "닉네임 정하기"}
                  </button>
                </strong>
                <span>{[providerName && `${providerName}로 로그인`, user.email].filter(Boolean).join(" · ") || "소셜 계정으로 로그인했어요"}</span>
              </>
            )}
          </div>
        </div>

        {user.signedIn && editingName && (
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
                autoFocus
                onChange={(event) => setNickname(event.target.value)}
              />
              <button className="button small" disabled={nickname.trim() === (profile.nickname ?? "")}>
                저장
              </button>
            </div>
            <p className="nickname-note">닉네임은 내 댓글에 함께 보여요. 실명은 쓰지 마세요.</p>
          </form>
        )}
        {nicknameNote && !editingName && (
          <p className="nickname-note" role="status">
            {nicknameNote}
          </p>
        )}

        {/* 로그인을 쓸 수 있는데 로그인하지 않았으면 관심 공고를 모을 수 없어 숫자 대신 로그인 안내를 보여 준다 */}
        {!guest && (
          <div className="hero-stats my-stats">
            <Link href="/calendar" className="stat">
              <span>관심 공고</span>
              <strong>{user.favorites.size}</strong>
            </Link>
            <Link href="/calendar" className="stat">
              <span>{SOON_DAYS}일 안 마감</span>
              <strong className={soonCount > 0 ? "warn" : ""}>{soonCount}</strong>
            </Link>
            {user.signedIn ? (
              <button type="button" className="stat" onClick={() => scrollTo("my-comments")}>
                <span>내 댓글</span>
                <strong>{myComments?.length ?? 0}</strong>
              </button>
            ) : (
              <button type="button" className="stat" onClick={() => scrollTo("my-info")}>
                <span>내 학교</span>
                <strong className="stat-text">{schools.find((s) => s.id === user.schoolId)?.shortName ?? "전체"}</strong>
              </button>
            )}
          </div>
        )}

        {guest && (
          <>
            <p className="card-sub my-login-why">로그인하면 어느 기기에서든 같은 관심 공고를 보고, 마감 알림을 받고, 후기를 남길 수 있어요.</p>
            <button className="button primary wide" onClick={() => user.setLoginOpen(true)}>
              로그인
            </button>
          </>
        )}
      </section>

      {/* 2. 맞춤 설정 안내: 아직 안 고른 것이 있으면 */}
      {user.ready && remaining.length > 0 && (
        <section className="card my-card my-setup">
          <h2 className="card-title">맞춤 공고를 위해 {remaining.length}가지만 골라 주세요</h2>
          <p className="card-sub">고른 대로 공고 목록 필터와 홈의 추천이 맞춰져요.</p>
          <div className="my-steps">
            {steps.map((step) => (
              <button key={step.label} className={`my-step ${step.done ? "done" : ""}`} onClick={() => scrollTo(step.id)}>
                {step.done ? "✓ " : ""}
                {step.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 3. 다가오는 내 일정 */}
      <section className="card my-card">
        <div className="my-section-head">
          <h2 className="card-title">다가오는 내 일정</h2>
          <Link href="/calendar" className="my-more">
            캘린더 <ChevronIcon size={16} />
          </Link>
        </div>
        {events.length === 0 ? (
          <p className="card-sub">
            {guest
              ? "로그인하고 공고에서 ☆를 누르면 마감일과 활동 일정이 여기 모여요."
              : user.favorites.size === 0
                ? "공고에서 ☆를 누르면 마감일과 활동 일정이 여기 모여요."
                : "관심 공고에 다가오는 일정이 없어요."}
          </p>
        ) : (
          <ul className="rows my-events">
            {events.map(({ date, kind, program }) => {
              const left = daysUntil(date, today);
              return (
                <li key={program.id + kind} className="row event-row">
                  <div className="event-date">
                    <strong className={kind === "마감" && left <= 3 ? "warn" : ""}>{left === 0 ? "오늘" : `D-${left}`}</strong>
                    <span>{formatDate(date, year)}</span>
                  </div>
                  <div className="row-body">
                    <div className="row-meta">
                      <span className={kind === "마감" ? "warn" : "accent"}>{kind === "마감" ? `${recruitWord(program)} 마감` : "활동 시작"}</span>
                    </div>
                    <Link href={`/programs/${program.id}`} className="row-title">
                      {program.title}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {user.favorites.size === 0 && (
          <Link href="/programs" className="button wide">
            공고 둘러보기
          </Link>
        )}
      </section>

      {/* 4. 내 정보 */}
      <section className="card my-card" id="my-info">
        <h2 className="card-title">내 정보</h2>
        <p className="card-sub">고른 대로 공고 목록의 학교·대상 필터가 처음부터 맞춰져요.</p>

        <h3 className="my-label">
          학교 <em>{schoolName}</em>
        </h3>
        <div className="my-options">
          <button className={`tag-option ${user.schoolId === null ? "on" : ""}`} onClick={() => user.setSchool(null)}>
            전체 학교
          </button>
        </div>
        {/* 학교가 많아 지역별로 나눠 보여 준다 */}
        {[...new Set(schools.map((s) => s.region))].map((region) => (
          <div key={region}>
            <p className="my-region">{region}</p>
            <div className="my-options">
              {schools
                .filter((s) => s.region === region)
                .map((s) => (
                  <button key={s.id} className={`tag-option ${user.schoolId === s.id ? "on" : ""}`} onClick={() => user.setSchool(s.id)}>
                    {s.name}
                  </button>
                ))}
            </div>
          </div>
        ))}

        <h3 className="my-label">
          신분·학년 <em>{whoText}</em>
        </h3>
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
          <div className="my-options spaced">
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
        )}
      </section>

      {/* 5. 관심 분야 */}
      <section className="card my-card" id="my-interests">
        <h2 className="card-title">관심 분야</h2>
        <p className="card-sub">고른 분야의 공고를 홈에서 따로 모아 보여 드려요. 여러 개 고를 수 있어요.</p>
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
        {profile.interests.length > 0 && (
          <Link href={interestHref} className="button wide">
            관심 분야 공고 {interestCount}개 보기
          </Link>
        )}
      </section>

      {savedLocally && (
        <p className="my-message" role="status">
          이 기기에만 저장됐어요. 계정 저장은 준비 중이에요.
        </p>
      )}

      {/* 6. 알림과 캘린더 */}
      <section className="card my-card">
        <h2 className="card-title">알림과 캘린더</h2>
        <label className="my-switch my-row">
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
        {otherDevice && !pushNote && (
          <div className="nickname-note">
            다른 기기에서 켠 알림이에요. 이 기기로도 받으려면{" "}
            <button className="link-button" disabled={pushBusy} onClick={() => void toggleDeadline(true)}>
              이 기기에서도 받기
            </button>
          </div>
        )}
        {pushNote && (
          <p className="nickname-note" role="status">
            {pushNote}
          </p>
        )}

        <div className="my-row">
          <span>
            <strong>캘린더 앱으로 내보내기</strong>
            <small>관심 공고 일정을 구글·애플·삼성 캘린더에 넣어요. 마감 하루 전 알림도 함께 들어가요.{favoritePrograms.length === 0 && " 관심 공고가 있으면 켜져요."}</small>
          </span>
          <button
            className="button small"
            disabled={favoritePrograms.length === 0}
            onClick={() => downloadIcs(favoritePrograms, "관심-일정.ics")}
          >
            <CalendarPlusIcon size={16} /> 내보내기
          </button>
        </div>

        {installable ? (
          <div className="my-row">
            <span>
              <strong>홈 화면에 추가</strong>
              <small>앱처럼 바로 열고, 인터넷이 끊겨도 마지막으로 본 공고를 볼 수 있어요.</small>
            </span>
            <button className="button small" onClick={() => void install()}>
              추가
            </button>
          </div>
        ) : (
          needsInstallForPush() && (
            <p className="nickname-note">아이폰은 Safari 공유 버튼 → &lsquo;홈 화면에 추가&rsquo;로 앱처럼 쓰고 알림도 받을 수 있어요.</p>
          )
        )}
      </section>

      {/* 7. 내 댓글 */}
      {user.signedIn && myComments && (
        <section className="card my-card" id="my-comments">
          <h2 className="card-title">내 댓글</h2>
          {myComments.length === 0 ? (
            <p className="card-sub">아직 쓴 댓글이 없어요. 해마다 열리는 프로그램의 상세 화면에서 후기를 남길 수 있어요.</p>
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

      {/* 8. 숨긴 사용자 (숨긴 사람이 있을 때만) */}
      {user.signedIn && blockCount !== null && blockCount > 0 && (
        <section className="card my-card">
          <h2 className="card-title">숨긴 사용자</h2>
          <p className="card-sub">{blockCount}명의 댓글을 숨기고 있어요.</p>
          <button className="button wide" onClick={unblockAll}>
            모두 다시 보기
          </button>
        </section>
      )}

      {/* 9. 의견 보내기 (운영자 답장도 여기에) */}
      <FeedbackBox />

      {/* 10. 안내 */}
      <section className="card my-card my-about">
        <h2 className="card-title">캠퍼스모아</h2>
        <p className="card-sub">
          {sources}에서 학생이 신청할 수 있는 공고를 매일 모아 정리해요. 정리는 자동이라 틀릴 수 있으니 신청 전에 꼭 원문을
          확인해 주세요. 틀린 정보는 공고 화면의 &ldquo;정보가 틀렸어요&rdquo;로 알려 주세요.
        </p>
      </section>
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
        {isAdmin && (
          <Link href="/admin">
            관리자 화면 <ChevronIcon size={18} />
          </Link>
        )}
      </nav>

      {message && (
        <p className="my-message" role="alert">
          {message}
        </p>
      )}

      {/* 10. 계정 */}
      {user.signedIn && (
        <div className="my-account-actions">
          <button className="button wide" onClick={user.signOut}>
            로그아웃
          </button>
          <button className="my-delete" onClick={deleteAccount} disabled={deleting}>
            {deleting ? "탈퇴하는 중…" : "회원 탈퇴"}
          </button>
        </div>
      )}
    </div>
  );
}
