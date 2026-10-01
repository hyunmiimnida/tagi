-- 프로필 설정(신분·학년·관심 분야·마감 알림·닉네임)을 계정에 저장하고, 댓글에 닉네임을 보여 준다.
-- schema.sql, moderation.sql을 실행한 뒤 Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다. (여러 번 실행해도 괜찮다)

alter table profiles add column if not exists status text check (status in ('재학생', '휴학생', '졸업생'));
alter table profiles add column if not exists grade text check (grade in ('1학년', '2학년', '3학년', '4학년'));
alter table profiles add column if not exists interests text[] not null default '{}';
alter table profiles add column if not exists notify_deadline boolean not null default false;
alter table profiles add column if not exists nickname text check (char_length(btrim(nickname)) between 2 and 12);

-- 댓글 읽기 뷰에 글쓴이 닉네임(없으면 "익명")을 더한다. 계정 번호(user_id)는 계속 공개하지 않는다
-- (칸이 늘어 create or replace가 안 될 수 있어 지우고 다시 만든다)
drop view if exists comment_feed;
create view comment_feed as
  select c.id, c.series_id, c.body, c.created_at,
    coalesce(c.user_id = auth.uid(), false) as mine,
    coalesce(nullif(btrim(p.nickname), ''), '익명') as author
  from comments c
  left join profiles p on p.user_id = c.user_id
  where (not c.hidden or c.user_id = auth.uid())
    and not exists (select 1 from blocks b where b.user_id = auth.uid() and b.blocked_id = c.user_id);
grant select on comment_feed to anon, authenticated;
