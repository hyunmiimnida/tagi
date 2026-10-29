-- 댓글·의견의 작성 시각 조작으로 도배 검사를 피하는 일을 막는다.
-- 댓글의 숨김·검토 시각도 처음 값으로 맞춰 신고 3건 자동 숨김을 피하지 못하게 한다.
-- Supabase의 SQL Editor에 붙여 넣고 Run을 누른다. (여러 번 실행해도 괜찮다)
-- 아직 만들지 않은 표·칸(예: admin.sql을 실행하기 전의 feedback 표, reviewed_at 칸)은 건너뛴다.
-- 나중에 moderation.sql·admin.sql을 실행했다면 이 파일을 한 번 더 실행한다.
-- admin.sql에는 comments·feedback insert가 없다. 관리자 update에는 영향이 없다.

do $$
declare
  has_hidden boolean;
  has_reviewed boolean;
  body text;
begin
  -- 댓글: 서버 시각으로 저장하고, 숨김·검토 상태는 처음 값으로 맞춘다 (있는 칸만)
  if to_regclass('public.comments') is not null then
    select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'comments' and column_name = 'hidden') into has_hidden;
    select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'comments' and column_name = 'reviewed_at') into has_reviewed;
    body := 'new.created_at := now();'
      || case when has_hidden then ' new.hidden := false;' else '' end
      || case when has_reviewed then ' new.reviewed_at := null;' else '' end
      || ' return new;';
    execute format($f$
      create or replace function guard_comment_insert() returns trigger
      language plpgsql security invoker set search_path = public as $g$ begin %s end $g$;
    $f$, body);
    -- 같은 시점의 트리거는 이름순으로 실행된다. 도배 검사(comments_block_suspended, comments_spam_check)보다 먼저 값을 맞추려고 aa를 붙인다
    execute 'drop trigger if exists comments_aa_guard_insert on comments';
    execute 'create trigger comments_aa_guard_insert before insert on comments for each row execute function guard_comment_insert()';
  end if;

  -- 의견(admin.sql로 만드는 표): 서버 시각으로 저장한다. 관리 항목은 기존 insert 정책이 검사한다
  if to_regclass('public.feedback') is not null then
    execute $f$
      create or replace function guard_feedback_insert() returns trigger
      language plpgsql security invoker set search_path = public as $g$ begin new.created_at := now(); return new; end $g$;
    $f$;
    -- 이름순으로 feedback_spam_check보다 먼저 실행되도록 aa를 붙인다
    execute 'drop trigger if exists feedback_aa_guard_insert on feedback';
    execute 'create trigger feedback_aa_guard_insert before insert on feedback for each row execute function guard_feedback_insert()';
  end if;
end $$;
