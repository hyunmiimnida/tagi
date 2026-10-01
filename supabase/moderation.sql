-- 회원 탈퇴, 댓글 신고·숨기기, 첫 댓글 전 이용 규칙 동의.
-- schema.sql을 실행한 뒤 Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다. (여러 번 실행해도 괜찮다)

alter table profiles add column if not exists rules_agreed_at timestamptz;
alter table comments add column if not exists hidden boolean not null default false;

-- 신고: 아무도 직접 읽거나 쓰지 못하고 report_comment 함수로만 쌓인다 (운영자는 Table Editor에서 본다)
create table if not exists reports (
  comment_id bigint not null references comments on delete cascade,
  reporter uuid not null default auth.uid() references auth.users on delete cascade,
  reason text not null check (char_length(reason) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (comment_id, reporter)
);
alter table reports enable row level security;

-- 숨긴 사용자(차단): 내가 숨긴 사람의 댓글은 나에게만 안 보인다
create table if not exists blocks (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  blocked_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);
alter table blocks enable row level security;
drop policy if exists "내 숨김 목록만" on blocks;
create policy "내 숨김 목록만" on blocks for select using (auth.uid() = user_id);
drop policy if exists "내 숨김 지우기" on blocks;
create policy "내 숨김 지우기" on blocks for delete using (auth.uid() = user_id);

-- 이용 규칙에 동의한 사람만 댓글을 쓴다
drop policy if exists "로그인하면 댓글 쓰기" on comments;
drop policy if exists "규칙에 동의하면 댓글 쓰기" on comments;
create policy "규칙에 동의하면 댓글 쓰기" on comments for insert with check (
  auth.uid() = user_id
  and exists (select 1 from profiles p where p.user_id = auth.uid() and p.rules_agreed_at is not null)
);

-- 누가 썼는지(user_id)는 공개하지 않는다. 댓글 읽기는 comment_feed로만 한다
drop policy if exists "댓글은 누구나 읽기" on comments;
drop policy if exists "내 댓글만 지우기" on comments;
revoke select, update, delete on comments from anon, authenticated;

create or replace view comment_feed as
  select c.id, c.series_id, c.body, c.created_at, coalesce(c.user_id = auth.uid(), false) as mine
  from comments c
  where (not c.hidden or c.user_id = auth.uid())
    and not exists (select 1 from blocks b where b.user_id = auth.uid() and b.blocked_id = c.user_id);
grant select on comment_feed to anon, authenticated;

create or replace function delete_my_comment(target bigint) returns void
language sql security definer set search_path = public as $$
  delete from comments where id = target and user_id = auth.uid();
$$;

-- 신고가 3건 쌓이면 운영자가 확인할 때까지 숨긴다 (다시 보이게 하려면 hidden을 false로)
create or replace function report_comment(target bigint, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  insert into reports (comment_id, reporter, reason) values (target, auth.uid(), left(why, 100))
    on conflict do nothing;
  update comments set hidden = true
    where id = target and (select count(*) from reports where comment_id = target) >= 3;
end $$;

create or replace function block_comment_author(target bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  insert into blocks (user_id, blocked_id)
    select auth.uid(), user_id from comments where id = target and user_id <> auth.uid()
    on conflict do nothing;
end $$;

-- 회원 탈퇴: 계정을 지우면 학교 설정·관심 표시·댓글·신고·숨김 기록이 함께 지워진다 (on delete cascade)
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function delete_my_comment(bigint), report_comment(bigint, text),
  block_comment_author(bigint), delete_my_account() from public, anon;
grant execute on function delete_my_comment(bigint), report_comment(bigint, text),
  block_comment_author(bigint), delete_my_account() to authenticated;
