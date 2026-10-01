-- 공고 정보 오류 신고 ("정보가 틀렸어요" 버튼). 로그인하지 않아도 신고할 수 있다.
-- Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다. (여러 번 실행해도 괜찮다)
-- 운영자는 Table Editor → program_reports 에서 보고, 고친 뒤 resolved를 true로 바꾼다.

create table if not exists program_reports (
  id bigint generated always as identity primary key,
  program_id text not null check (char_length(program_id) between 1 and 100),
  reason text not null check (char_length(reason) between 1 and 30),
  note text check (char_length(note) <= 300),
  reporter uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  resolved boolean not null default false
);

create index if not exists program_reports_open_idx on program_reports (resolved, created_at desc);

-- 아무도 읽지 못하고(운영자만 Table Editor에서 본다), 누구나 새 신고만 쓸 수 있다
alter table program_reports enable row level security;
drop policy if exists "누구나 정보 오류 신고" on program_reports;
create policy "누구나 정보 오류 신고" on program_reports for insert to anon, authenticated
  with check (resolved = false and (reporter is null or reporter = auth.uid()));
