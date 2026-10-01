-- 마감 알림(웹 푸시)과 신고 알림. profile.sql, program-reports.sql을 실행한 뒤 Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다.
-- (여러 번 실행해도 괜찮다)
-- 알림은 GitHub Actions(.github/workflows/notify.yml)가 매일 아침 scripts/notify.ts로 보낸다.

-- 기기마다 알림 받을 주소 (브라우저가 만들어 준다). 내 기기 것만 보고 쓰고 지운다
create table if not exists push_subscriptions (
  endpoint text primary key check (char_length(endpoint) between 10 and 1000),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists "내 알림 기기만" on push_subscriptions;
create policy "내 알림 기기만" on push_subscriptions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 운영자에게 알린 신고는 표시해 두고 다시 알리지 않는다
alter table reports add column if not exists alerted_at timestamptz;
alter table program_reports add column if not exists alerted_at timestamptz;
