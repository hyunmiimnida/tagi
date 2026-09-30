"use client";

import { createClient } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toDateString } from "./filter.ts";

// 로그인, 학교 설정, 관심 표시를 한곳에서 관리한다.
// Supabase 설정(.env.local)이 없으면 "체험 모드"로 동작해 이 브라우저에만 저장한다.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = url && key ? createClient(url, key) : null;

export const LOGIN_PROVIDERS = [
  { id: "google", name: "구글" },
  { id: "kakao", name: "카카오" },
] as const;

type ProviderId = (typeof LOGIN_PROVIDERS)[number]["id"];

interface UserState {
  loginEnabled: boolean; // Supabase가 설정되어 있는지
  ready: boolean;
  email: string | null;
  schoolId: string | null;
  favorites: Set<string>;
  loginOpen: boolean;
  setLoginOpen: (open: boolean) => void;
  setSchool: (schoolId: string | null) => void;
  toggleFavorite: (programId: string) => void;
  signIn: (provider: ProviderId) => void;
  signOut: () => void;
}

const UserContext = createContext<UserState | null>(null);

const SCHOOL_KEY = "schoolId";
const FAVORITES_KEY = "favorites";

function readLocal(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
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
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    setSchoolId(readLocal(SCHOOL_KEY));

    if (!supabase) {
      setFavorites(new Set(JSON.parse(readLocal(FAVORITES_KEY) ?? "[]")));
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
    Promise.all([
      supabase.from("profiles").select("school_id").eq("user_id", userId).maybeSingle(),
      supabase.from("favorites").select("program_id").eq("user_id", userId),
    ]).then(([profile, favoriteRows]) => {
      if (cancelled) return;
      if (profile.data?.school_id) setSchoolId(profile.data.school_id);
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
      email,
      schoolId,
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
    }),
    [ready, email, schoolId, favorites, loginOpen, setSchool, toggleFavorite],
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
