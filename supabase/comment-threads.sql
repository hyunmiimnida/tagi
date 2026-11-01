-- 실행 순서: schema → moderation → spam → profile → avatar → program-reports → notify → admin → insert-guard → gacha → 이 파일.
-- profile.sql 재실행 시 이 파일도 재실행한다. 여러 번 실행해도 기존 데이터는 유지되며, gacha는 전·후 재실행 모두 가능하다.
begin;

-- 있던 글은 모두 후기가 된다. 사람은 글을 고칠 수 없어서(moderation.sql) 쓴 뒤에는 종류가 바뀌지 않는다
alter table comments add column if not exists kind text not null default 'review' check (kind in ('review', 'talk'));

-- 한 단계 답글. gacha.sql이 먼저 실행되어 parent_id가 이미 있을 수도 있다.
alter table comments add column if not exists parent_id bigint;
alter table comments add column if not exists deleted boolean not null default false;
alter table comments alter column user_id drop not null;
alter table comments drop constraint if exists comments_body_check;
alter table comments add constraint comments_body_check check (
  (not deleted and user_id is not null and char_length(btrim(body)) between 1 and 500)
  or (deleted and parent_id is null and user_id is null and body = '' and not hidden)
);
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'comments'::regclass and conname = 'comments_parent_fk') then
    alter table comments add constraint comments_parent_fk foreign key (parent_id) references comments(id);
  end if;
end $$;
create index if not exists comments_parent_idx on comments (parent_id, created_at, id);

-- 원글을 잠가 답글 작성과 삭제를 순서대로 처리한다. 입력의 kind·deleted는 믿지 않는다.
create or replace function guard_comment_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent comments;
begin
  new.deleted := false;
  if new.parent_id is null then return new; end if;
  select * into parent from comments where id = new.parent_id for update;
  if not found then raise exception 'reply:missing'; end if;
  if parent.parent_id is not null then raise exception 'reply:nested'; end if;
  if parent.series_id <> new.series_id then raise exception 'reply:series'; end if;
  if parent.deleted then raise exception 'reply:deleted'; end if;
  if parent.hidden or exists (select 1 from blocks where user_id = auth.uid() and blocked_id = parent.user_id) then
    raise exception 'reply:unavailable';
  end if;
  new.kind := parent.kind;
  return new;
end $$;
drop trigger if exists comments_ab_guard_reply on comments;
create trigger comments_ab_guard_reply before insert on comments
  for each row execute function guard_comment_reply();

-- 본인·관리자의 DELETE와 auth.users의 cascade가 모두 이곳을 거친다.
-- auth.users가 먼저 지워지므로 탈퇴 중 회수는 reclaim_review_keys가 기존처럼 건너뛴다.
create or replace function preserve_comment_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 관리 기록에는 조치만 남기고, 이 글에서 복사해 둔 본문 조각도 지운다.
  update admin_log set detail = null where target = '#' || old.id
    and action in ('댓글 숨기기', '댓글 지우기', '신고 정리(문제 없음)', '댓글 다시 보이기');
  if old.parent_id is not null then
    perform 1 from comments where id = old.parent_id for update;
  elsif exists (select 1 from comments where parent_id = old.id) then
    if not old.deleted then
      delete from reports where comment_id = old.id;
      update comments set body = '', user_id = null, deleted = true, hidden = false, reviewed_at = null where id = old.id;
    end if;
    return null;
  end if;
  return old;
end $$;
drop trigger if exists comments_preserve_thread on comments;
create trigger comments_preserve_thread before delete on comments
  for each row execute function preserve_comment_thread();

create or replace function cleanup_comment_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.parent_id is not null then
    delete from comments c where c.id = old.parent_id and c.deleted
      and not exists (select 1 from comments r where r.parent_id = c.id);
  end if;
  return old;
end $$;
drop trigger if exists comments_cleanup_thread on comments;
create trigger comments_cleanup_thread after delete on comments
  for each row execute function cleanup_comment_thread();

-- 삭제된 자리에는 신고 기록을 새로 연결할 수도 없다. 기존 신고 함수·검토 시각 처리는 그대로 쓴다.
create or replace function guard_report_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from comments where id = new.comment_id and not deleted for update;
  if not found then raise exception 'reply:deleted'; end if;
  return new;
end $$;
drop trigger if exists reports_guard_thread on reports;
create trigger reports_guard_thread before insert on reports
  for each row execute function guard_report_thread();

-- 삭제가 끝난 뒤 관리 기록에 본문을 다시 복사하지 않는다 (admin.sql에도 같은 정의).
create or replace function admin_moderate_comment(target bigint, act text) returns void
language plpgsql security definer set search_path = public as $$
declare snippet text;
begin
  perform assert_admin();
  select left(body, 40) into snippet from comments where id = target for update;
  if act = 'hide' then
    update comments set hidden = true, reviewed_at = now() where id = target;
  elsif act in ('show', 'keep') then
    update comments set hidden = false, reviewed_at = now() where id = target;
  elsif act = 'delete' then
    delete from comments where id = target;
    snippet := null;
  else
    raise exception 'unknown_action';
  end if;
  perform log_admin(case act when 'hide' then '댓글 숨기기' when 'delete' then '댓글 지우기' when 'keep' then '신고 정리(문제 없음)'
    else '댓글 다시 보이기' end, '#' || target, snippet);
end $$;
revoke execute on function admin_moderate_comment(bigint, text) from public, anon;
grant execute on function admin_moderate_comment(bigint, text) to authenticated;

revoke execute on function guard_comment_reply(), preserve_comment_thread(), cleanup_comment_thread(), guard_report_thread()
  from public, anon, authenticated;

-- 공개 뷰는 계정 번호를 숨기는 기존 방식(owner 권한) 유지. 표 SELECT는 계속 금지한다.
-- 숨김 글은 글쓴이에게만 보인다. 다른 사람에게는 보이는 답글의 parent_id로 화면에서 빈 자리를 만든다.
drop view if exists comment_feed;
create view comment_feed as
  select c.id, c.series_id, c.body, c.created_at,
    coalesce(c.user_id = auth.uid(), false) as mine,
    case when c.deleted then null else coalesce(nullif(btrim(p.nickname), ''), '익명') end as author,
    c.kind, c.parent_id, c.deleted
  from comments c left join profiles p on p.user_id = c.user_id
  where (not c.hidden or c.user_id = auth.uid())
    and not exists (select 1 from blocks b where b.user_id = auth.uid() and b.blocked_id = c.user_id);
grant select on comment_feed to anon, authenticated;

create or replace view comment_avatars as
  select c.id as comment_id, p.avatar
  from comments c join profiles p on p.user_id = c.user_id
  where not c.hidden and not c.deleted and p.avatar is not null
    and not exists (select 1 from blocks b where b.user_id = auth.uid() and b.blocked_id = c.user_id);
grant select on comment_avatars to anon, authenticated;
commit;
