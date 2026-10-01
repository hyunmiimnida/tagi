-- 댓글 도배 막기. moderation.sql을 실행한 뒤 Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다. (여러 번 실행해도 괜찮다)
-- 규칙에 걸리면 'spam:이유' 오류로 거절하고, 화면(components/Comments.tsx)이 이유에 맞는 안내를 보여 준다.
--   too_fast   같은 사람이 20초 안에 또 쓰기
--   daily      하루(24시간)에 20개 넘게 쓰기
--   duplicate  하루 안에 같은 내용 또 쓰기
--   links      링크 2개 이상

create or replace function check_comment_spam() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  links int;
begin
  if exists (select 1 from comments where user_id = new.user_id and created_at > now() - interval '20 seconds') then
    raise exception 'spam:too_fast';
  end if;
  if (select count(*) from comments where user_id = new.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'spam:daily';
  end if;
  if exists (select 1 from comments where user_id = new.user_id and created_at > now() - interval '1 day'
             and lower(btrim(body)) = lower(btrim(new.body))) then
    raise exception 'spam:duplicate';
  end if;
  select count(*) into links from regexp_matches(new.body, '(https?://|www\.)', 'gi');
  if links >= 2 then
    raise exception 'spam:links';
  end if;
  return new;
end $$;

drop trigger if exists comments_spam_check on comments;
create trigger comments_spam_check before insert on comments
  for each row execute function check_comment_spam();
