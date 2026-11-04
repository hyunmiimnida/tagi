-- 관리자 화면 "리서치" 탭: 이용 기록(퍼널 분석·히트맵), 설문, A/B 테스트.
-- admin.sql을 실행한 뒤 Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다. (여러 번 실행해도 괜찮다)
-- 실행 전에는 사이트가 이용 기록을 보내려다 조용히 실패하고(화면은 그대로), 리서치 탭은 "설정되지 않았어요"로 보인다.
--
-- 개인정보 먼저:
-- · 기기마다 브라우저가 만든 무작위 값(anon_id)으로 구분한다. IP·기기 정보·입력한 글자·검색어 원문은 저장하지 않는다
--   (검색은 "검색함"과 글자 수만). 로그인한 사람은 계정 번호도 남고, 탈퇴하면 그 계정의 기록을 지운다.
-- · 프로필의 "이용 기록 보내기"를 끄거나 브라우저의 추적 안 함(DNT·GPC)이 켜져 있으면 사이트가 아무것도 보내지 않는다 (lib/analytics.ts).
-- · 3년(1095일)이 지난 기록은 purge_old_events()로 지운다 (개인정보처리방침 제4조) (실행 방법은 docs/설정-안내.md).
-- · 넣기는 track_event()·submit_survey() 함수로만, 읽기는 관리자 함수로만 한다.

-- ───────── 이용 기록 ─────────
create table if not exists analytics_events (
  id bigint generated always as identity primary key,
  anon_id text not null check (char_length(anon_id) between 8 and 64),
  user_id uuid references auth.users on delete cascade,
  session_id text check (char_length(session_id) <= 64),
  name text not null,
  path text check (char_length(path) <= 200),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_time_idx on analytics_events (created_at desc);
create index if not exists analytics_events_name_idx on analytics_events (name, created_at desc);
create index if not exists analytics_events_anon_idx on analytics_events (anon_id, created_at desc);
alter table analytics_events enable row level security; -- 읽기·쓰기 규칙이 없어 함수로만 다룬다
revoke all on analytics_events from anon, authenticated;

-- 보낼 수 있는 기록 이름 (lib/analytics.ts의 EVENT_NAMES와 같아야 한다)
create or replace function analytics_names() returns text[]
language sql immutable as $$
  select array['page_view', 'program_open', 'filter_change', 'search', 'favorite_on', 'apply_click', 'login_start', 'login_done',
               'review_start', 'review_submit', 'draw', 'click', 'exposure', 'survey_view']
$$;

-- 기록 넣기: events = [{name, path, props}] (한 번에 20개까지). 시각은 서버가 정하고 이름은 허용 목록만, 한 기기 1분 120개까지
create or replace function track_event(anon text, session text, events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  recent int;
  room int;
  added int;
begin
  if jsonb_typeof(events) <> 'array' or char_length(coalesce(anon, '')) not between 8 and 64 then return 0; end if;
  select count(*) into recent from analytics_events where anon_id = anon and created_at > now() - interval '1 minute';
  room := least(20, 120 - recent);
  if room <= 0 then return 0; end if;
  insert into analytics_events (anon_id, user_id, session_id, name, path, props)
    select anon, auth.uid(), left(session, 64), e->>'name', left(split_part(e->>'path', '?', 1), 200),
      case when jsonb_typeof(e->'props') = 'object' and pg_column_size(e->'props') <= 1000 then e->'props' else '{}'::jsonb end
    from (select value as e from jsonb_array_elements(events) limit room) t
    where e->>'name' = any(analytics_names());
  get diagnostics added = row_count;
  return added;
end $$;

-- 오래된 기록 지우기 (기본 1095일 = 3년, 방침과 같게). SQL Editor·예약 작업(서비스 키)에서 부르거나 관리자가 부른다
create or replace function purge_old_events(keep_days int default 1095) returns int
language plpgsql security definer set search_path = public as $$
declare
  removed int;
begin
  if auth.uid() is not null then perform assert_admin(); end if;
  delete from analytics_events where created_at < now() - make_interval(days => greatest(keep_days, 30));
  get diagnostics removed = row_count;
  return removed;
end $$;

-- ───────── 퍼널 분석 ─────────
-- steps = [{name, path?}]: 같은 기기가 앞 단계 다음에 그 단계를 했으면 다음 단계에 닿은 것으로 센다 (기기 = anon_id)
-- 돌려주는 값: [{name, path, people}] 단계마다 닿은 기기 수
create or replace function admin_funnel(steps jsonb, since timestamptz default null, until timestamptz default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  step jsonb;
  i int := 0;
  result jsonb := '[]'::jsonb;
  reached int;
begin
  perform assert_admin();
  if jsonb_typeof(steps) <> 'array' or jsonb_array_length(steps) not between 1 and 8 then raise exception 'research:steps'; end if;
  drop table if exists pg_temp.funnel_reach;
  create temp table funnel_reach (anon_id text primary key, t timestamptz) on commit drop;
  for step in select value from jsonb_array_elements(steps) loop
    if i = 0 then
      insert into funnel_reach
        select anon_id, min(created_at) from analytics_events e
        where e.name = step->>'name' and (step->>'path' is null or e.path = step->>'path')
          and (since is null or e.created_at >= since) and (until is null or e.created_at < until)
        group by anon_id;
    else
      create temp table funnel_next on commit drop as
        select r.anon_id, min(e.created_at) as t from funnel_reach r
        join analytics_events e on e.anon_id = r.anon_id and e.created_at >= r.t
        where e.name = step->>'name' and (step->>'path' is null or e.path = step->>'path')
          and (until is null or e.created_at < until)
        group by r.anon_id;
      delete from funnel_reach;
      insert into funnel_reach select * from funnel_next;
      drop table funnel_next;
    end if;
    select count(*) into reached from funnel_reach;
    result := result || jsonb_build_object('name', step->>'name', 'path', step->>'path', 'people', reached);
    i := i + 1;
  end loop;
  return result;
end $$;

-- 기록 이름별 수 (리서치 탭 맨 위 요약)
create or replace function admin_event_counts(since timestamptz default null) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return json_build_object(
    'names', (select coalesce(json_object_agg(name, n), '{}'::json) from (
               select name, count(*) n from analytics_events where since is null or created_at >= since group by name) t),
    'devices', (select count(distinct anon_id) from analytics_events where since is null or created_at >= since),
    'signedIn', (select count(distinct user_id) from analytics_events where (since is null or created_at >= since) and user_id is not null)
  );
end $$;

-- ───────── 히트맵 ─────────
-- click 기록의 props: page(화면 이름 '/'·'/programs'·'/programs/*'), device('m' 640px 미만·'d'), x(화면 너비 대비 0~1), y(문서 맨 위에서 px), el(data-hm 이름)
create or replace function admin_heatmap(page text, device text, since timestamptz default null) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return json_build_object(
    -- 점: x는 1%, y는 20px 칸으로 묶어 센다
    'points', (select coalesce(json_agg(json_build_object('x', x, 'y', y, 'n', n)), '[]'::json) from (
                 select round((props->>'x')::numeric, 2) x, (floor((props->>'y')::numeric / 20) * 20)::int y, count(*) n
                 from analytics_events
                 where name = 'click' and props->>'page' = page and props->>'device' = device
                   and (since is null or created_at >= since)
                   and props->>'x' ~ '^[0-9.]+$' and props->>'y' ~ '^[0-9.]+$'
                 group by 1, 2) t),
    'elements', (select coalesce(json_agg(json_build_object('el', el, 'n', n) order by n desc), '[]'::json) from (
                   select coalesce(props->>'el', '') el, count(*) n from analytics_events
                   where name = 'click' and props->>'page' = page and props->>'device' = device and (since is null or created_at >= since)
                   group by 1) t),
    'total', (select count(*) from analytics_events
              where name = 'click' and props->>'page' = page and props->>'device' = device and (since is null or created_at >= since))
  );
end $$;

-- ───────── 설문 ─────────
-- questions = [{id, type: choice·multi·rating·text, title, options?}]. audience: all(모두)·login(로그인한 사람)·school(그 학교를 고른 사람)
create table if not exists surveys (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and pg_column_size(questions) <= 8000),
  audience text not null default 'all' check (audience in ('all', 'login', 'school')),
  school_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table surveys enable row level security;
drop policy if exists "켜진 설문은 누구나" on surveys;
create policy "켜진 설문은 누구나" on surveys for select to anon, authenticated
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
drop policy if exists "관리자 설문 관리" on surveys;
create policy "관리자 설문 관리" on surveys for all to authenticated using (is_admin()) with check (is_admin());

create table if not exists survey_responses (
  id bigint generated always as identity primary key,
  survey_id bigint not null references surveys on delete cascade,
  anon_id text not null check (char_length(anon_id) between 8 and 64),
  user_id uuid references auth.users on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 6000),
  created_at timestamptz not null default now(),
  unique (survey_id, anon_id)
);
create unique index if not exists survey_responses_user_idx on survey_responses (survey_id, user_id) where user_id is not null;
alter table survey_responses enable row level security; -- 규칙이 없어 함수로만 다룬다
revoke all on survey_responses from anon, authenticated;

-- 설문 답하기: 한 사람(로그인했으면 계정, 아니면 기기)당 한 번
create or replace function submit_survey(target bigint, anon text, answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  s surveys;
begin
  select * into s from surveys where id = target and active
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());
  if not found then raise exception 'survey:closed'; end if;
  if s.audience <> 'all' and auth.uid() is null then raise exception 'survey:login'; end if;
  if s.audience = 'school' and not exists (select 1 from profiles where user_id = auth.uid() and school_id = s.school_id) then
    raise exception 'survey:audience';
  end if;
  insert into survey_responses (survey_id, anon_id, user_id, answers) values (target, anon, auth.uid(), answers);
exception when unique_violation then
  raise exception 'survey:done';
end $$;

-- 결과: 질문마다 객관식 수·별점 평균·주관식 답(관리자만)
create or replace function admin_survey_results(target bigint) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return json_build_object(
    'responses', (select count(*) from survey_responses where survey_id = target),
    'answers', (select coalesce(json_agg(answers order by created_at), '[]'::json) from survey_responses where survey_id = target)
  );
end $$;

-- ───────── A/B 테스트 ─────────
-- variants = [{name, weight}] (weight 합은 아무 값이나, 비율로 나눈다). goal = 목표 기록 이름 (예: apply_click)
create table if not exists experiments (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  variants jsonb not null check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) between 2 and 5),
  goal text not null,
  note text check (char_length(note) <= 300),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table experiments enable row level security;
drop policy if exists "켜진 실험은 누구나" on experiments;
create policy "켜진 실험은 누구나" on experiments for select to anon, authenticated
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
drop policy if exists "관리자 실험 관리" on experiments;
create policy "관리자 실험 관리" on experiments for all to authenticated using (is_admin()) with check (is_admin());

-- 결과: 변형마다 노출된 기기 수와, 처음 노출된 뒤 목표 기록을 남긴 기기 수
create or replace function admin_experiment_results(target text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  goal_name text;
begin
  perform assert_admin();
  select goal into goal_name from experiments where id = target;
  return (select coalesce(json_agg(json_build_object('variant', variant, 'exposed', exposed, 'converted', converted) order by variant), '[]'::json)
    from (
      select x.variant, count(*) as exposed,
        count(*) filter (where exists (select 1 from analytics_events g where g.anon_id = x.anon_id and g.name = goal_name and g.created_at >= x.first_seen)) as converted
      from (
        select anon_id, props->>'variant' as variant, min(created_at) as first_seen
        from analytics_events where name = 'exposure' and props->>'exp' = target group by 1, 2
      ) x group by x.variant
    ) t);
end $$;

revoke execute on function track_event(text, text, jsonb), submit_survey(bigint, text, jsonb) from public;
grant execute on function track_event(text, text, jsonb), submit_survey(bigint, text, jsonb) to anon, authenticated;
revoke execute on function purge_old_events(int), admin_funnel(jsonb, timestamptz, timestamptz), admin_event_counts(timestamptz),
  admin_heatmap(text, text, timestamptz), admin_survey_results(bigint), admin_experiment_results(text)
  from public, anon;
grant execute on function purge_old_events(int), admin_funnel(jsonb, timestamptz, timestamptz), admin_event_counts(timestamptz),
  admin_heatmap(text, text, timestamptz), admin_survey_results(bigint), admin_experiment_results(text)
  to authenticated;
grant execute on function purge_old_events(int) to service_role;
