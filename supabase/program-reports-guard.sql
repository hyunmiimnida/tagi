-- 공고 정보 오류 신고("정보가 틀렸어요") 도배 막기.
-- program-reports.sql, notify.sql 다음에 Supabase의 SQL Editor에 붙여 넣고 Run을 누른다. (여러 번 실행해도 괜찮다)
-- 로그인하지 않아도 신고할 수 있어서, 같은 신고를 계속 보내 표가 쌓이고 알림이 넘치지 않게 한다.
-- 걸리면 'spam:이유' 오류로 거절하고, 화면(components/ReportInfo.tsx)이 이유에 맞는 안내를 보여 준다.
--   duplicate  같은 공고에 같은 이유로 하루 안에 이미 신고가 있음 (화면은 "이미 접수됐어요"로 안내)
--   program    한 공고에 처리 안 된 신고가 이미 5개
--   too_many   한 사람이 1시간에 10개, 로그인하지 않은 사람은 모두 합쳐 1시간에 60개

create or replace function guard_program_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- 작성 시각·처리 상태는 보내는 사람이 정하지 못하게 서버가 정한다
  new.created_at := now();
  new.resolved := false;
  new.alerted_at := null;

  if exists (select 1 from program_reports where program_id = new.program_id and reason = new.reason
             and not resolved and created_at > now() - interval '1 day') then
    raise exception 'spam:duplicate';
  end if;
  if (select count(*) from program_reports where program_id = new.program_id and not resolved) >= 5 then
    raise exception 'spam:program';
  end if;
  if new.reporter is not null and (select count(*) from program_reports where reporter = new.reporter
      and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'spam:too_many';
  end if;
  if new.reporter is null and (select count(*) from program_reports where reporter is null
      and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'spam:too_many';
  end if;
  return new;
end $$;

drop trigger if exists program_reports_guard on program_reports;
create trigger program_reports_guard before insert on program_reports
  for each row execute function guard_program_report();
