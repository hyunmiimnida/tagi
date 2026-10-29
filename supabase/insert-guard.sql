-- 댓글·의견의 작성 시각 조작으로 도배 검사를 피하는 일을 막는다.
-- 댓글의 숨김·검토 시각도 초기화해 신고 3건 자동 숨김을 피하지 못하게 한다.
-- moderation.sql, spam.sql, admin.sql 다음에 실행한다.
-- Supabase의 SQL Editor에 붙여 넣고 Run을 누른다. (여러 번 실행해도 괜찮다)
-- admin.sql에는 comments·feedback insert가 없다. 관리자 update에는 영향이 없다.

-- 댓글은 서버 시각으로 저장하고, 숨김·검토 상태는 처음 값으로 맞춘다
create or replace function guard_comment_insert() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.created_at := now();
  new.hidden := false;
  new.reviewed_at := null;
  return new;
end $$;

-- 같은 시점의 트리거는 이름순으로 실행된다. 두 검사보다 먼저 값을 맞춘다
-- comments_block_suspended, comments_spam_check보다 앞서도록 aa를 붙인다
drop trigger if exists comments_aa_guard_insert on comments;
create trigger comments_aa_guard_insert before insert on comments
  for each row execute function guard_comment_insert();

-- 의견은 서버 시각으로 저장한다. 관리 항목은 기존 insert 정책이 검사한다
create or replace function guard_feedback_insert() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.created_at := now();
  return new;
end $$;

-- 이름순으로 feedback_spam_check보다 먼저 실행되도록 aa를 붙인다
drop trigger if exists feedback_aa_guard_insert on feedback;
create trigger feedback_aa_guard_insert before insert on feedback
  for each row execute function guard_feedback_insert();
