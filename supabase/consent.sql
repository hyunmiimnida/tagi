-- 가입 동의: 처음 로그인(가입)할 때 만 14세 이상·이용약관·개인정보 수집·이용(이용 기록 포함)에 동의받은 기록.
-- schema.sql을 실행한 뒤 Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다. (여러 번 실행해도 괜찮다)
-- 실행 전에는 동의 화면이 뜨지 않고, 로그인한 사람의 이용 기록은 보내지 않는다 (로그인 안 한 방문자 기록은 그대로).
--
-- 약관·방침을 크게 바꿔 다시 동의받아야 하면 lib/policy.ts의 CONSENT_VERSION을 올린다. 기존 회원은 다음 접속 때 동의 화면을 다시 본다.
-- 동의 시각은 서버가 정하고, 사람은 자기 줄을 읽기만 한다 (고치거나 지울 수 없음). 탈퇴하면 계정과 함께 지워진다.

create table if not exists user_consents (
  user_id uuid not null references auth.users on delete cascade,
  version text not null check (char_length(version) between 1 and 20),
  agreed_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table user_consents enable row level security;
drop policy if exists "내 동의 기록만 보기" on user_consents;
create policy "내 동의 기록만 보기" on user_consents for select using (auth.uid() = user_id);
revoke insert, update, delete, truncate on user_consents from anon, authenticated;

-- 동의하기: 필수 항목(만 14세 이상·이용약관·개인정보 수집·이용)을 모두 체크했을 때 화면이 부른다
create or replace function agree_terms(ver text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if ver is null or char_length(ver) not between 1 and 20 then raise exception 'consent:version'; end if;
  insert into user_consents (user_id, version) values (auth.uid(), ver) on conflict do nothing;
end $$;

revoke execute on function agree_terms(text) from public, anon;
grant execute on function agree_terms(text) to authenticated;
