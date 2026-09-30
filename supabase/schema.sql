-- Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다.
-- 로그인한 사용자의 학교 설정과 관심 표시를 저장하는 표를 만든다.

create table if not exists profiles (
  user_id uuid primary key references auth.users on delete cascade,
  school_id text
);

create table if not exists favorites (
  user_id uuid not null references auth.users on delete cascade,
  program_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, program_id)
);

-- 각 사용자는 자기 데이터만 읽고 쓸 수 있다
alter table profiles enable row level security;
alter table favorites enable row level security;

create policy "내 프로필만" on profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "내 관심 목록만" on favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
