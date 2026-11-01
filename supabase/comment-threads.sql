-- 후기와 대화 구분. schema.sql, moderation.sql, profile.sql을 실행한 뒤 Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다. (여러 번 실행해도 괜찮다)
-- 실행하기 전에는 화면에 탭이 보이지 않고 지금처럼 모두 후기로 올라간다.
-- 열쇠조각은 후기 글에만 준다 (조건은 gacha.sql의 reward_review_keys, 그 파일도 다시 실행한다).
-- profile.sql을 다시 실행하면 뷰에서 kind가 빠지므로 이 파일도 다시 실행한다.

-- 있던 글은 모두 후기가 된다. 사람은 글을 고칠 수 없어서(moderation.sql) 쓴 뒤에는 종류가 바뀌지 않는다
alter table comments add column if not exists kind text not null default 'review' check (kind in ('review', 'talk'));

drop view if exists comment_feed;
create view comment_feed as
  select c.id, c.series_id, c.body, c.created_at,
    coalesce(c.user_id = auth.uid(), false) as mine,
    coalesce(nullif(btrim(p.nickname), ''), '익명') as author,
    c.kind
  from comments c
  left join profiles p on p.user_id = c.user_id
  where (not c.hidden or c.user_id = auth.uid())
    and not exists (select 1 from blocks b where b.user_id = auth.uid() and b.blocked_id = c.user_id);
grant select on comment_feed to anon, authenticated;
