-- 보안 보완 (2026-11 보안 점검 결과). 다른 SQL 파일을 모두 실행한 뒤 맨 마지막에 실행한다.
-- 여러 번 실행해도 안전하다. 다른 SQL 파일을 다시 실행했다면 이 파일도 다시 실행한다.

-- ───────── 1단계: 의견함·정지 ─────────

-- 1) '내 의견 보기'(my_feedback)는 읽기 전용.
--    보기는 만든 사람 권한으로 돌아서 feedback 표의 규칙(새 의견만 쓰기, 고치기·지우기는 관리자만)을
--    거치지 않는다. Supabase 기본 권한이 보기에도 쓰기 권한을 주므로 읽기만 남긴다.
do $$
begin
  if to_regclass('public.my_feedback') is not null then
    execute 'revoke all on my_feedback from public, anon, authenticated';
    execute 'grant select on my_feedback to authenticated';
  end if;
end $$;

-- 2) 로그인한 사람이 보내는 의견·정보 오류 신고는 서버가 본인 계정으로 채운다.
--    계정 칸을 비워 보내면 정지 검사와 한 사람당 개수 제한을 건너뛸 수 있었다.
--    (화면은 원래 계정 칸을 보내지 않고 기본값 auth.uid()를 쓰므로 화면 동작은 그대로다)
create or replace function bind_feedback_user() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  return new;
end $$;

create or replace function bind_report_reporter() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is not null then new.reporter := auth.uid(); end if;
  return new;
end $$;

do $$
begin
  -- 트리거는 이름순으로 실행된다: feedback_aa_guard_insert → feedback_ab_bind_user → feedback_spam_check
  if to_regclass('public.feedback') is not null then
    execute 'drop trigger if exists feedback_ab_bind_user on feedback';
    execute 'create trigger feedback_ab_bind_user before insert on feedback for each row execute function bind_feedback_user()';
  end if;
  -- program_reports_aa_bind_reporter → program_reports_guard(개수 제한)
  if to_regclass('public.program_reports') is not null then
    execute 'drop trigger if exists program_reports_aa_bind_reporter on program_reports';
    execute 'create trigger program_reports_aa_bind_reporter before insert on program_reports for each row execute function bind_report_reporter()';
  end if;
end $$;

-- 3) 관리자 계정은 정지할 수 없다 (강제 탈퇴와 같은 규칙)
create or replace function admin_suspend(target uuid, days int, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  if target = auth.uid() then raise exception 'cannot_self'; end if;
  if exists (select 1 from admins where user_id = target) then raise exception 'cannot_suspend_admin'; end if;
  insert into suspensions (user_id, until, reason, created_by)
    values (target, case when days is null then null else now() + make_interval(days => days) end, left(why, 200), auth.uid())
    on conflict (user_id) do update set until = excluded.until, reason = excluded.reason,
      created_by = excluded.created_by, created_at = now();
  perform log_admin('이용 정지', target::text, coalesce(days::text || '일', '영구') || coalesce(' · ' || nullif(btrim(why), ''), ''));
end $$;
revoke execute on function admin_suspend(uuid, int, text) from public, anon;
grant execute on function admin_suspend(uuid, int, text) to authenticated;

-- 4) 남의 정지 여부를 묻는 함수는 서버 안(트리거·관리 함수)에서만 쓴다.
--    로그인 사용자도 부를 수 없게 한다. 내 정지 상태는 my_suspension()으로 본다.
revoke execute on function is_suspended(uuid) from public, anon, authenticated;
