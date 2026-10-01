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

-- 반복 프로그램 후기·정보 나눔 댓글 (같은 프로그램의 모든 회차가 함께 본다)
create table if not exists comments (
  id bigint generated always as identity primary key,
  series_id text not null,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists comments_series_idx on comments (series_id, created_at desc);

alter table comments enable row level security;

-- 누구나 읽을 수 있고, 로그인한 사람은 자기 이름으로만 쓰고 자기 글만 지운다
create policy "댓글은 누구나 읽기" on comments for select using (true);
create policy "로그인하면 댓글 쓰기" on comments for insert with check (auth.uid() = user_id);
create policy "내 댓글만 지우기" on comments for delete using (auth.uid() = user_id);
