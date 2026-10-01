"use client";

import { createClient } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toDateString } from "./filter.ts";

// 로그인, 학교 설정, 관심 표시를 한곳에서 관리한다.
// Supabase 설정(.env.local)이 없으면 "체험 모드"로 동작해 이 브라우저에만 저장한다.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;

export const LOGIN_PROVIDERS = [
  { id: "kakao", name: "카카오" },
  { id: "google", name: "구글" },
] as const;

type ProviderId = (typeof LOGIN_PROVIDERS)[number]["id"];

// 프로필 설정. 로그인 전에는 이 브라우저에, 로그인하면 계정(profiles 표)에도 저장한다
export interface Profile {
  status: string | null; // 재학생·휴학생·졸업생
  grade: string | null; // 1학년~4학년
  interests: string[]; // 관심 분야 태그
  notifyDeadline: boolean; // 마감 하루 전 알림 (앱에서 쓸 설정)
  nickname: string | null; // 댓글에 보이는 이름. 없으면 "익명"
}

export const EMPTY_PROFILE: Profile = { status: null, grade: null, interests: [], notifyDeadline: false, nickname: null };
const PROFILE_COLUMNS = "school_id, status, grade, interests, notify_deadline, nickname";

interface UserState {
  loginEnabled: boolean; // Supabase가 설정되어 있는지
  ready: boolean;
  signedIn: boolean;
  userId: string | null;
  email: string | null; // 카카오는 이메일을 주지 않을 수 있다
  schoolId: string | null;
  profile: Profile;
  setProfile: (patch: Partial<Profile>) => Promise<boolean>; // 계정에 저장하지 못하면 false (브라우저에는 저장됨)
  favorites: Set<string>;
  loginOpen: boolean;
  setLoginOpen: (open: boolean) => void;
  setSchool: (schoolId: string | null) => void;
  toggleFavorite: (programId: string) => void;
  signIn: (provider: ProviderId) => void;
  signOut: () => void;
  deleteAccount: () => Promise<boolean>; // 계정과 계정에 저장된 모든 데이터를 지운다
}

const UserContext = createContext<UserState | null>(null);

const SCHOOL_KEY = "schoolId";
const FAVORITES_KEY = "favorites";
const PROFILE_KEY = "profile";

function readLocalProfile(): Profile {
  try {
    const value = JSON.parse(readLocal(PROFILE_KEY) ?? "{}");
    return { ...EMPTY_PROFILE, ...(value && typeof value === "object" ? value : {}) };
  } catch {
    return EMPTY_PROFILE;
  }
}

function readLocal(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

// 저장값이 깨져 있으면(잘못된 JSON 등) 빈 목록으로 시작한다
function readLocalList(name: string): Set<string> {
  try {
    const value: unknown = JSON.parse(readLocal(name) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeLocal(name: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(name);
    else localStorage.setItem(name, value);
  } catch {
    // 저장소를 쓸 수 없는 브라우저에서는 저장하지 않는다
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [profile, setProfileState] = useState<Profile>(EMPTY_PROFILE);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    setSchoolId(readLocal(SCHOOL_KEY));
    setProfileState(readLocalProfile());

    if (!supabase) {
      setFavorites(readLocalList(FAVORITES_KEY));
      setReady(true);
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setEmail(session?.user.email ?? null);
      if (!session) {
        setFavorites(new Set());
        setReady(true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // 로그인하면 계정에 저장된 학교와 관심 목록을 불러온다
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    const client = supabase;
    // 프로필 칸(supabase/profile.sql)을 아직 만들지 않았으면 학교만 불러온다
    const loadProfile = async () => {
      const full = await client.from("profiles").select(PROFILE_COLUMNS).eq("user_id", userId).maybeSingle();
      return full.error ? client.from("profiles").select("school_id").eq("user_id", userId).maybeSingle() : full;
    };
    Promise.all([loadProfile(), client.from("favorites").select("program_id").eq("user_id", userId)]).then(([profile, favoriteRows]) => {
      if (cancelled) return;
      // 계정에 저장된 값이 있으면 "전체 학교"(null)라도 그대로 따른다
      if (profile.data) setSchoolId(profile.data.school_id ?? null);
      const row = profile.data as Record<string, unknown> | null;
      if (row && "status" in row) {
        const next: Profile = {
          status: (row.status as string | null) ?? null,
          grade: (row.grade as string | null) ?? null,
          interests: (row.interests as string[] | null) ?? [],
          notifyDeadline: Boolean(row.notify_deadline),
          nickname: (row.nickname as string | null) ?? null,
        };
        setProfileState(next);
        writeLocal(PROFILE_KEY, JSON.stringify(next));
      }
      setFavorites(new Set((favoriteRows.data ?? []).map((row) => row.program_id as string)));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setSchool = useCallback(
    (next: string | null) => {
      setSchoolId(next);
      writeLocal(SCHOOL_KEY, next);
      if (supabase && userId) {
        void supabase.from("profiles").upsert({ user_id: userId, school_id: next }).then();
      }
    },
    [userId],
  );

  const setProfile = useCallback(
    async (patch: Partial<Profile>) => {
      const next = { ...profile, ...patch };
      setProfileState(next);
      writeLocal(PROFILE_KEY, JSON.stringify(next));
      if (!supabase || !userId) return true;
      const { error } = await supabase.from("profiles").upsert({
        user_id: userId,
        school_id: schoolId,
        status: next.status,
        grade: next.grade,
        interests: next.interests,
        notify_deadline: next.notifyDeadline,
        nickname: next.nickname,
      });
      return !error;
    },
    [profile, userId, schoolId],
  );

  const toggleFavorite = useCallback(
    (programId: string) => {
      // 관심 표시를 누르는 순간에만 로그인을 요청한다
      if (supabase && !userId) {
        setLoginOpen(true);
        return;
      }
      const next = new Set(favorites);
      const adding = !next.has(programId);
      if (adding) next.add(programId);
      else next.delete(programId);
      setFavorites(next);

      if (!supabase) {
        writeLocal(FAVORITES_KEY, JSON.stringify([...next]));
      } else if (adding) {
        void supabase.from("favorites").upsert({ user_id: userId, program_id: programId }).then();
      } else {
        void supabase.from("favorites").delete().eq("user_id", userId).eq("program_id", programId).then();
      }
    },
    [favorites, userId],
  );

  const value = useMemo<UserState>(
    () => ({
      loginEnabled: supabase !== null,
      ready,
      signedIn: userId !== null,
      userId,
      email,
      schoolId,
      profile,
      setProfile,
      favorites,
      loginOpen,
      setLoginOpen,
      setSchool,
      toggleFavorite,
      signIn: (provider) => {
        void supabase?.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
      },
      signOut: () => {
        void supabase?.auth.signOut();
      },
      deleteAccount: async () => {
        if (!supabase || !userId) return false;
        const { error } = await supabase.rpc("delete_my_account");
        if (error) return false;
        // 이 브라우저에 남은 설정도 지운다. 이미 지운 계정이라 로그아웃은 이 브라우저에서만 한다
        writeLocal(SCHOOL_KEY, null);
        writeLocal(FAVORITES_KEY, null);
        writeLocal(PROFILE_KEY, null);
        setProfileState(EMPTY_PROFILE);
        setSchoolId(null);
        await supabase.auth.signOut({ scope: "local" });
        return true;
      },
    }),
    [ready, userId, email, schoolId, profile, setProfile, favorites, loginOpen, setSchool, toggleFavorite],
  );

  return <UserContext value={value}>{children}</UserContext>;
}

export function useUser(): UserState {
  const state = useContext(UserContext);
  if (!state) throw new Error("UserProvider 안에서만 쓸 수 있음");
  return state;
}

// 오늘 날짜. 미리 만들어 둔 화면과 어긋나지 않도록 브라우저에서만 값을 준다
const subscribe = () => () => {};
export const useToday = () => useSyncExternalStore(subscribe, () => toDateString(new Date()), () => "");
