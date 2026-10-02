-- 관리자 화면(/admin): 회원 관리·이용 정지, 의견함, 댓글 관리, 정보 오류 신고, 사이트 공지, 관리 기록.
-- schema.sql, moderation.sql, profile.sql, program-reports.sql, notify.sql을 실행한 뒤
-- Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다. (여러 번 실행해도 괜찮다)
--
-- 관리자는 admins 표에 있는 계정뿐이다. 관리 기능은 모두 아래 함수(security definer)로만 하고,
-- 함수마다 먼저 관리자인지 확인한다 (assert_admin). 그래서 사이트에 비밀 키를 넣지 않는다.

-- ───────── 관리자 ─────────
create table if not exists admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function assert_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
end $$;

drop policy if exists "관리자만 관리자 목록" on admins;
create policy "관리자만 관리자 목록" on admins for select to authenticated using (is_admin());

-- 첫 관리자: 이 이메일로 로그인한 계정 (카카오처럼 이메일이 없는 계정은 /admin 화면에 나오는 줄을 대신 실행)
insert into admins (user_id) select id from auth.users where email = 'whgusals4@gmail.com' on conflict do nothing;

-- ───────── 관리 기록: 누가 언제 무엇을 했는지 ─────────
create table if not exists admin_log (
  id bigint generated always as identity primary key,
  admin_id uuid default auth.uid(),
  action text not null,
  target text,
  detail text,
  created_at timestamptz not null default now()
);
alter table admin_log enable row level security;
drop policy if exists "관리자만 기록 보기" on admin_log;
create policy "관리자만 기록 보기" on admin_log for select to authenticated using (is_admin());

create or replace function log_admin(act text, tgt text, info text) returns void
language sql security definer set search_path = public as $$
  insert into admin_log (admin_id, action, target, detail) values (auth.uid(), act, tgt, left(info, 300));
$$;
revoke execute on function log_admin(text, text, text) from public, anon, authenticated;

-- ───────── 이용 정지: 정지된 사람은 댓글·의견을 쓰지 못한다 ─────────
-- profiles는 본인이 고칠 수 있는 표라 따로 둔다. until이 비어 있으면 영구 정지
create table if not exists suspensions (
  user_id uuid primary key references auth.users on delete cascade,
  until timestamptz,
  reason text check (char_length(reason) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table suspensions enable row level security;

create or replace function is_suspended(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from suspensions where user_id = target and (until is null or until > now()));
$$;

-- 내 정지 상태 (댓글 화면이 안내할 때 쓴다). 정지가 아니면 null
create or replace function my_suspension() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('until', until, 'reason', reason) from suspensions
  where user_id = auth.uid() and (until is null or until > now());
$$;

create or replace function check_comment_suspended() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_suspended(new.user_id) then raise exception 'spam:suspended'; end if;
  return new;
end $$;
-- 트리거는 이름 순서로 실행된다: 도배 검사(comments_spam_check)보다 먼저 정지를 알린다
drop trigger if exists comments_suspended_check on comments;
drop trigger if exists comments_block_suspended on comments;
create trigger comments_block_suspended before insert on comments
  for each row execute function check_comment_suspended();

-- ───────── 의견함: 프로필의 "의견 보내기" ─────────
create table if not exists feedback (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users on delete cascade,
  category text not null check (category in ('버그', '제안', '기타')),
  body text not null check (char_length(btrim(body)) between 5 and 1000),
  page text check (char_length(page) <= 200),
  status text not null default 'new' check (status in ('new', 'doing', 'done')),
  admin_note text check (char_length(admin_note) <= 1000),
  reply text check (char_length(reply) <= 1000),
  replied_at timestamptz,
  alerted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists feedback_status_idx on feedback (status, created_at desc);
alter table feedback enable row level security;

-- 누구나(로그인하지 않아도) 새 의견만 쓸 수 있다. 읽기·고치기는 관리자만
drop policy if exists "누구나 의견 보내기" on feedback;
create policy "누구나 의견 보내기" on feedback for insert to anon, authenticated
  with check (status = 'new' and admin_note is null and reply is null and replied_at is null and alerted_at is null
              and (user_id is null or user_id = auth.uid()));
drop policy if exists "관리자 의견 보기" on feedback;
create policy "관리자 의견 보기" on feedback for select to authenticated using (is_admin());
drop policy if exists "관리자 의견 고치기" on feedback;
create policy "관리자 의견 고치기" on feedback for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "관리자 의견 지우기" on feedback;
create policy "관리자 의견 지우기" on feedback for delete to authenticated using (is_admin());

-- 내가 보낸 의견과 답장 (관리자 메모는 보이지 않는다)
create or replace view my_feedback as
  select id, category, body, status, reply, replied_at, created_at from feedback where user_id = auth.uid();
grant select on my_feedback to authenticated;

-- 의견 도배 막기: 한 사람(로그인하지 않은 사람은 모두 합쳐) 1시간에 5개(비로그인 30개), 정지된 사람은 못 씀
create or replace function check_feedback_spam() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and is_suspended(new.user_id) then raise exception 'spam:suspended'; end if;
  if new.user_id is not null and (select count(*) from feedback where user_id = new.user_id
      and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'spam:too_many';
  end if;
  if new.user_id is null and (select count(*) from feedback where user_id is null
      and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'spam:too_many';
  end if;
  return new;
end $$;
drop trigger if exists feedback_spam_check on feedback;
create trigger feedback_spam_check before insert on feedback
  for each row execute function check_feedback_spam();

-- 답장을 쓰면 답장 시각을 적는다
create or replace function stamp_feedback_reply() returns trigger
language plpgsql as $$
begin
  if new.reply is distinct from old.reply then
    new.replied_at := case when nullif(btrim(new.reply), '') is null then null else now() end;
  end if;
  return new;
end $$;
drop trigger if exists feedback_reply_stamp on feedback;
create trigger feedback_reply_stamp before update on feedback
  for each row execute function stamp_feedback_reply();

-- ───────── 사이트 공지: 모든 화면 맨 위에 보이는 안내 ─────────
create table if not exists announcements (
  id bigint generated always as identity primary key,
  body text not null check (char_length(btrim(body)) between 1 and 200),
  link text check (link ~ '^(https?://|/)' and char_length(link) <= 300),
  level text not null default 'info' check (level in ('info', 'warn')),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
alter table announcements enable row level security;
drop policy if exists "켜진 공지는 누구나" on announcements;
create policy "켜진 공지는 누구나" on announcements for select to anon, authenticated
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
drop policy if exists "관리자 공지 관리" on announcements;
create policy "관리자 공지 관리" on announcements for all to authenticated using (is_admin()) with check (is_admin());

-- ───────── 정보 오류 신고: 관리자가 보고 해결 표시 ─────────
drop policy if exists "관리자 정보 오류 신고 보기" on program_reports;
create policy "관리자 정보 오류 신고 보기" on program_reports for select to authenticated using (is_admin());
drop policy if exists "관리자 정보 오류 신고 고치기" on program_reports;
create policy "관리자 정보 오류 신고 고치기" on program_reports for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "관리자 정보 오류 신고 지우기" on program_reports;
create policy "관리자 정보 오류 신고 지우기" on program_reports for delete to authenticated using (is_admin());

-- ───────── 댓글: 관리자가 확인한 시각 ─────────
-- 확인한 뒤에 들어온 신고만 "확인할 신고"로 센다
alter table comments add column if not exists reviewed_at timestamptz;

-- (moderation.sql의 report_comment를 바꾼다) 확인한 뒤에 새로 3건이 쌓여야 다시 숨긴다
create or replace function report_comment(target bigint, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  insert into reports (comment_id, reporter, reason) values (target, auth.uid(), left(why, 100))
    on conflict do nothing;
  update comments c set hidden = true
    where c.id = target
      and (select count(*) from reports r where r.comment_id = target
           and r.created_at > coalesce(c.reviewed_at, '-infinity'::timestamptz)) >= 3;
end $$;

-- ───────── 관리 함수 ─────────

-- 대시보드 숫자
create or replace function admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform assert_admin();
  return json_build_object(
    'users', (select count(*) from auth.users),
    'new7', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active7', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'notify', (select count(*) from profiles where notify_deadline),
    'devices', (select count(*) from push_subscriptions),
    'favorites', (select count(*) from favorites),
    'favoriteUsers', (select count(distinct user_id) from favorites),
    'comments', (select count(*) from comments),
    'comments7', (select count(*) from comments where created_at > now() - interval '7 days'),
    'hidden', (select count(*) from comments where hidden),
    'openReports', (select count(distinct r.comment_id) from reports r join comments c on c.id = r.comment_id
                    where r.created_at > coalesce(c.reviewed_at, '-infinity'::timestamptz)),
    'openProgramReports', (select count(*) from program_reports where not resolved),
    'newFeedback', (select count(*) from feedback where status = 'new'),
    'doingFeedback', (select count(*) from feedback where status = 'doing'),
    'suspended', (select count(*) from suspensions where until is null or until > now()),
    'signups', (select json_agg(json_build_object('day', d, 'count',
                  (select count(*) from auth.users u where (u.created_at at time zone 'Asia/Seoul')::date = d)) order by d)
                from generate_series(0, 13) i, lateral (select today - i as d) days),
    'schools', (select coalesce(json_object_agg(coalesce(school_id, ''), n), '{}'::json)
                from (select school_id, count(*) n from profiles group by school_id) s),
    'statuses', (select coalesce(json_object_agg(coalesce(status, ''), n), '{}'::json)
                 from (select status, count(*) n from profiles group by status) s)
  );
end $$;

-- 회원 목록. 찾기(q)는 이메일·닉네임 일부 또는 계정 번호, 보기(mode): all·new·suspended·commenters·admins
create or replace function admin_users(q text default '', mode text default 'all', lim int default 50, off int default 0)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  result json;
begin
  perform assert_admin();
  q := btrim(coalesce(q, ''));
  with base as (
    select u.id, u.email, u.raw_app_meta_data->>'provider' as provider, u.created_at, u.last_sign_in_at,
      p.nickname, p.school_id, p.status, p.grade, coalesce(p.notify_deadline, false) as notify,
      (select count(*) from favorites f where f.user_id = u.id) as favorites,
      (select count(*) from comments c where c.user_id = u.id) as comments,
      s.until as suspended_until,
      (s.user_id is not null and (s.until is null or s.until > now())) as suspended,
      exists (select 1 from admins a where a.user_id = u.id) as admin
    from auth.users u
    left join profiles p on p.user_id = u.id
    left join suspensions s on s.user_id = u.id
    where q = '' or u.email ilike '%' || q || '%' or p.nickname ilike '%' || q || '%' or u.id::text = q
  ), picked as (
    select * from base
    where mode = 'all'
      or (mode = 'new' and created_at > now() - interval '7 days')
      or (mode = 'suspended' and suspended)
      or (mode = 'commenters' and comments > 0)
      or (mode = 'admins' and admin)
  )
  select json_build_object(
    'total', (select count(*) from picked),
    'rows', coalesce((select json_agg(x) from (select * from picked order by created_at desc limit lim offset off) x), '[]'::json)
  ) into result;
  return result;
end $$;

-- 회원 한 명 자세히
create or replace function admin_user_detail(target uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  result json;
begin
  perform assert_admin();
  select json_build_object(
    'id', u.id, 'email', u.email, 'provider', u.raw_app_meta_data->>'provider',
    'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
    'nickname', p.nickname, 'school_id', p.school_id, 'status', p.status, 'grade', p.grade,
    'interests', coalesce(p.interests, '{}'), 'notify', coalesce(p.notify_deadline, false),
    'rules_agreed_at', p.rules_agreed_at,
    'admin', exists (select 1 from admins a where a.user_id = u.id),
    'devices', (select count(*) from push_subscriptions d where d.user_id = u.id),
    'favorites', (select coalesce(json_agg(f.program_id order by f.created_at desc), '[]'::json)
                  from favorites f where f.user_id = u.id),
    'comments', (select coalesce(json_agg(json_build_object('id', c.id, 'series_id', c.series_id, 'body', c.body,
                    'created_at', c.created_at, 'hidden', c.hidden) order by c.created_at desc), '[]'::json)
                 from comments c where c.user_id = u.id),
    'feedback', (select coalesce(json_agg(json_build_object('id', f.id, 'category', f.category, 'body', f.body,
                    'status', f.status, 'created_at', f.created_at) order by f.created_at desc), '[]'::json)
                 from feedback f where f.user_id = u.id),
    'reportsReceived', (select count(*) from reports r join comments c on c.id = r.comment_id where c.user_id = u.id),
    'reportsMade', (select count(*) from reports r where r.reporter = u.id),
    'blockedBy', (select count(*) from blocks b where b.blocked_id = u.id),
    'suspension', (select json_build_object('until', s.until, 'reason', s.reason, 'created_at', s.created_at,
                     'active', s.until is null or s.until > now())
                   from suspensions s where s.user_id = u.id)
  ) into result
  from auth.users u left join profiles p on p.user_id = u.id
  where u.id = target;
  return result;
end $$;

-- 이용 정지 (days가 비어 있으면 영구)
create or replace function admin_suspend(target uuid, days int, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  if target = auth.uid() then raise exception 'cannot_self'; end if;
  insert into suspensions (user_id, until, reason, created_by)
    values (target, case when days is null then null else now() + make_interval(days => days) end, left(why, 200), auth.uid())
    on conflict (user_id) do update set until = excluded.until, reason = excluded.reason,
      created_by = excluded.created_by, created_at = now();
  perform log_admin('이용 정지', target::text, coalesce(days::text || '일', '영구') || coalesce(' · ' || nullif(btrim(why), ''), ''));
end $$;

create or replace function admin_unsuspend(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  delete from suspensions where user_id = target;
  perform log_admin('정지 풀기', target::text, null);
end $$;

create or replace function admin_reset_nickname(target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  old text;
begin
  perform assert_admin();
  select nickname into old from profiles where user_id = target;
  update profiles set nickname = null where user_id = target;
  perform log_admin('닉네임 지우기', target::text, old);
end $$;

-- 이 사람의 댓글을 모두 숨기기 (도배·광고 계정 정리)
create or replace function admin_hide_user_comments(target uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform assert_admin();
  update comments set hidden = true, reviewed_at = now() where user_id = target and not hidden;
  get diagnostics n = row_count;
  perform log_admin('댓글 모두 숨기기', target::text, n || '개');
  return n;
end $$;

-- 강제 탈퇴: 계정과 계정에 딸린 모든 데이터를 지운다 (관리자 계정은 못 지움)
create or replace function admin_delete_user(target uuid, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  if target = auth.uid() or exists (select 1 from admins where user_id = target) then
    raise exception 'cannot_delete_admin';
  end if;
  delete from auth.users where id = target;
  perform log_admin('강제 탈퇴', target::text, why);
end $$;

-- 댓글 목록. mode: reported(확인할 신고가 있는 것)·hidden·all
create or replace function admin_comments(mode text default 'reported', q text default '', lim int default 50, off int default 0)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  result json;
begin
  perform assert_admin();
  q := btrim(coalesce(q, ''));
  with base as (
    select c.id, c.series_id, c.body, c.created_at, c.hidden, c.reviewed_at, c.user_id,
      coalesce(nullif(btrim(p.nickname), ''), '익명') as author,
      is_suspended(c.user_id) as author_suspended,
      (select count(*) from reports r where r.comment_id = c.id) as reports,
      (select count(*) from reports r where r.comment_id = c.id
         and r.created_at > coalesce(c.reviewed_at, '-infinity'::timestamptz)) as open_reports,
      (select array_agg(distinct r.reason) from reports r where r.comment_id = c.id) as reasons,
      (select max(r.created_at) from reports r where r.comment_id = c.id) as last_report_at
    from comments c left join profiles p on p.user_id = c.user_id
    where q = '' or c.body ilike '%' || q || '%' or p.nickname ilike '%' || q || '%'
  ), picked as (
    select * from base
    where mode = 'all' or (mode = 'reported' and open_reports > 0) or (mode = 'hidden' and hidden)
  )
  select json_build_object(
    'total', (select count(*) from picked),
    'rows', coalesce((select json_agg(x) from (
      select * from picked
      order by case when mode = 'reported' then last_report_at end desc nulls last, created_at desc
      limit lim offset off) x), '[]'::json)
  ) into result;
  return result;
end $$;

-- 댓글 처리. act: hide(숨기기)·show(다시 보이기)·keep(문제 없음: 보이게 두고 신고 정리)·delete(지우기)
create or replace function admin_moderate_comment(target bigint, act text) returns void
language plpgsql security definer set search_path = public as $$
declare
  snippet text;
begin
  perform assert_admin();
  select left(body, 40) into snippet from comments where id = target;
  if act = 'hide' then
    update comments set hidden = true, reviewed_at = now() where id = target;
  elsif act in ('show', 'keep') then
    update comments set hidden = false, reviewed_at = now() where id = target;
  elsif act = 'delete' then
    delete from comments where id = target;
  else
    raise exception 'unknown_action';
  end if;
  perform log_admin(case act when 'hide' then '댓글 숨기기' when 'delete' then '댓글 지우기' when 'keep' then '신고 정리(문제 없음)'
    else '댓글 다시 보이기' end, '#' || target, snippet);
end $$;

-- 관리자가 아닌 사람은 관리 함수를 부를 수 없게 (함수 안에서도 한 번 더 확인한다)
revoke execute on function admin_stats(), admin_users(text, text, int, int), admin_user_detail(uuid),
  admin_suspend(uuid, int, text), admin_unsuspend(uuid), admin_reset_nickname(uuid), admin_hide_user_comments(uuid),
  admin_delete_user(uuid, text), admin_comments(text, text, int, int), admin_moderate_comment(bigint, text),
  my_suspension(), is_suspended(uuid), assert_admin()
  from public, anon;
grant execute on function admin_stats(), admin_users(text, text, int, int), admin_user_detail(uuid),
  admin_suspend(uuid, int, text), admin_unsuspend(uuid), admin_reset_nickname(uuid), admin_hide_user_comments(uuid),
  admin_delete_user(uuid, text), admin_comments(text, text, int, int), admin_moderate_comment(bigint, text),
  my_suspension()
  to authenticated;
grant execute on function is_admin() to anon, authenticated;
