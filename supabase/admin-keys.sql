-- 관리자 화면의 "뽑기" 관리: 열쇠조각·무기 지급과 회수, 열쇠조각·뽑기 기록 보기, 뽑기 통계, 조작 점검.
-- admin.sql과 gacha.sql(이 파일과 같은 PR에서 고친 것)을 실행한 뒤 Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다.
-- (여러 번 실행해도 괜찮다)
--
-- 지급·회수도 key_ledger에 남긴다: 열쇠조각은 admin_grant·admin_revoke, 무기는 weapon_grant·weapon_revoke(열쇠조각 변화 0, detail = 무기 id).
-- 그래서 "지갑 = 기록의 합", "가진 무기 = 뽑기 + 관리자 지급" 규칙이 늘 맞아야 하고, admin_integrity_check()가 이것을 점검한다.
-- 사람은 원래 자기 줄을 읽기만 할 수 있어 조작할 수 없다. 점검은 규칙이 깨지지 않았는지(SQL Editor에서 직접 고친 흔적 등) 확인하는 것이다.

-- gacha.sql을 먼저 다시 실행했는지 확인 (아래 무기 트리거가 뽑기를 막지 않으려면 draw_weapon에 표시가 있어야 한다)
do $$
begin
  if position('app.weapon_grant' in pg_get_functiondef('draw_weapon()'::regprocedure)) = 0 then
    raise exception '먼저 supabase/gacha.sql을 다시 실행해 주세요 (뽑기 함수가 새 버전이어야 해요)';
  end if;
end $$;

-- 열쇠조각이 바뀐 까닭 (gacha.sql과 같은 목록)
alter table key_ledger drop constraint if exists key_ledger_reason_check;
alter table key_ledger add constraint key_ledger_reason_check
  check (reason in ('welcome', 'daily', 'review', 'review_undo', 'draw', 'refund',
                    'admin_grant', 'admin_revoke', 'weapon_grant', 'weapon_revoke', 'shard_exchange'));
create index if not exists key_ledger_time_idx on key_ledger (created_at desc);

-- 열쇠조각·무기 표는 함수로만 고친다. 읽기는 RLS(자기 줄만)가 막고, 쓰기 권한은 아예 뺀다 (함수는 주인 권한으로 돌아서 그대로 된다)
revoke insert, update, delete, truncate on key_wallets, owned_weapons, key_ledger, gacha_pool from anon, authenticated;

-- ───────── 무기는 뽑기·관리자 지급 함수 안에서만 넣는다 ─────────
-- 함수가 set_config('app.weapon_grant', 'on', true)로 표시한 뒤에만 넣을 수 있다 (그 실행 안에서만 유효).
-- SQL Editor에서 꼭 직접 넣어야 하면 같은 실행에서 select set_config('app.weapon_grant', 'on', true); 를 먼저 하고,
-- key_ledger에 weapon_grant 줄도 함께 남긴다 (안 남기면 점검에 "출처 없는 무기"로 나온다)
create or replace function guard_owned_weapons() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.weapon_grant', true), '') <> 'on' then
    raise exception 'weapon_grant_only';
  end if;
  return new;
end $$;
drop trigger if exists owned_weapons_guard on owned_weapons;
create trigger owned_weapons_guard before insert or update on owned_weapons
  for each row execute function guard_owned_weapons();

-- ───────── 알려진 예외 정리 (2026-11-02 운영자 요청 지급) ─────────
-- 관리자 계정에 무기를 owned_weapons에 직접 넣고, 열쇠조각 9000개를 reason = 'refund'로 적었다.
-- 점검이 이것을 "출처 없는 무기"·"뽑기 없는 돌려받기"로 잡지 않게 관리자 지급 기록으로 옮겨 적는다. 관리자 계정만 고친다.
update key_ledger set reason = 'admin_grant'
  where reason = 'refund' and detail = '운영자 요청 지급' and user_id in (select user_id from admins);
insert into key_ledger (user_id, change, reason, detail, created_at)
  select w.user_id, 0, 'weapon_grant', w.weapon_id, w.obtained_at
  from owned_weapons w
  where w.user_id in (select user_id from admins)
    and not exists (select 1 from key_ledger l where l.user_id = w.user_id and l.reason in ('draw', 'weapon_grant', 'shard_exchange') and l.detail = w.weapon_id);

-- ───────── 지급·회수 ─────────

-- 열쇠조각 주기 (1~10000개, 이유 필수)
create or replace function admin_grant_keys(target uuid, amount int, why text) returns json
language plpgsql security definer set search_path = public as $$
declare
  wallet key_wallets;
begin
  perform assert_admin();
  why := btrim(coalesce(why, ''));
  if amount is null or amount < 1 or amount > 10000 then raise exception 'keys:amount'; end if;
  if why = '' then raise exception 'keys:reason'; end if;
  if not exists (select 1 from auth.users where id = target) then raise exception 'keys:no_user'; end if;
  wallet := lock_wallet(target);
  update key_wallets set keys = keys + amount, updated_at = now() where user_id = target returning * into wallet;
  insert into key_ledger (user_id, change, reason, detail) values (target, amount, 'admin_grant', left(why, 200));
  perform log_admin('열쇠조각 지급', target::text, amount || '개 · ' || why);
  return json_build_object('keys', wallet.keys);
end $$;

-- 열쇠조각 회수: 지갑이 음수가 되지 않게 남은 만큼만 가져가고, 모자란 양을 알려 준다
create or replace function admin_revoke_keys(target uuid, amount int, why text) returns json
language plpgsql security definer set search_path = public as $$
declare
  wallet key_wallets;
  taken int;
begin
  perform assert_admin();
  why := btrim(coalesce(why, ''));
  if amount is null or amount < 1 or amount > 10000 then raise exception 'keys:amount'; end if;
  if why = '' then raise exception 'keys:reason'; end if;
  if not exists (select 1 from auth.users where id = target) then raise exception 'keys:no_user'; end if;
  wallet := lock_wallet(target);
  taken := least(wallet.keys, amount);
  if taken > 0 then
    update key_wallets set keys = keys - taken, updated_at = now() where user_id = target returning * into wallet;
    insert into key_ledger (user_id, change, reason, detail) values (target, -taken, 'admin_revoke', left(why, 200));
  end if;
  perform log_admin('열쇠조각 회수', target::text, taken || '개' || case when taken < amount then ' (요청 ' || amount || '개)' else '' end || ' · ' || why);
  return json_build_object('taken', taken, 'short', amount - taken, 'keys', wallet.keys);
end $$;

-- 무기 주기 (뽑기에 나오는 무기만)
create or replace function admin_grant_weapon(target uuid, weapon text, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  why := btrim(coalesce(why, ''));
  if why = '' then raise exception 'keys:reason'; end if;
  if not exists (select 1 from gacha_pool where weapon_id = weapon) then raise exception 'weapon:unknown'; end if;
  if not exists (select 1 from auth.users where id = target) then raise exception 'keys:no_user'; end if;
  perform lock_wallet(target);
  if exists (select 1 from owned_weapons where user_id = target and weapon_id = weapon) then raise exception 'weapon:owned'; end if;
  perform set_config('app.weapon_grant', 'on', true);
  insert into owned_weapons (user_id, weapon_id) values (target, weapon);
  insert into key_ledger (user_id, change, reason, detail) values (target, 0, 'weapon_grant', weapon);
  perform log_admin('무기 지급', target::text, weapon || ' · ' || why);
end $$;

-- 무기 회수 (장착 중이면 화면이 다음에 들어올 때 맨손으로 바꾼다: lib/user.tsx가 갖지 않은 무기를 맨손으로)
create or replace function admin_revoke_weapon(target uuid, weapon text, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  why := btrim(coalesce(why, ''));
  if why = '' then raise exception 'keys:reason'; end if;
  perform lock_wallet(target);
  delete from owned_weapons where user_id = target and weapon_id = weapon;
  if not found then raise exception 'weapon:not_owned'; end if;
  insert into key_ledger (user_id, change, reason, detail) values (target, 0, 'weapon_revoke', weapon);
  perform log_admin('무기 회수', target::text, weapon || ' · ' || why);
end $$;

-- ───────── 보기 ─────────

-- 회원 한 명의 열쇠조각·무기 (무기마다 얻은 경로: draw 뽑기·admin 관리자 지급·none 기록 없음)
create or replace function admin_user_keys(target uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return json_build_object(
    'keys', coalesce((select keys from key_wallets where user_id = target), 0),
    'shards', coalesce((select legend_shards from key_wallets where user_id = target), 0),
    'debt', coalesce((select key_debt from key_wallets where user_id = target), 0),
    'last_daily', (select last_daily from key_wallets where user_id = target),
    'draws', (select count(*) from key_ledger where user_id = target and reason = 'draw'),
    'weapons', (select coalesce(json_agg(json_build_object('weapon_id', w.weapon_id, 'obtained_at', w.obtained_at,
        'source', case
          when exists (select 1 from key_ledger l where l.user_id = target and l.reason in ('draw', 'shard_exchange') and l.detail = w.weapon_id) then 'draw'
          when exists (select 1 from key_ledger l where l.user_id = target and l.reason = 'weapon_grant' and l.detail = w.weapon_id) then 'admin'
          else 'none' end) order by w.obtained_at desc), '[]'::json)
      from owned_weapons w where w.user_id = target)
  );
end $$;

-- 열쇠조각 기록 (누가·언제·얼마·왜·그 뒤 남은 양). target·reason·since가 비어 있으면 전체
create or replace function admin_key_ledger(target uuid default null, reason_filter text default null,
  since timestamptz default null, lim int default 30, off int default 0) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  result json;
begin
  perform assert_admin();
  with base as (
    select l.*, sum(l.change) over (partition by l.user_id order by l.id) as balance
    from key_ledger l where target is null or l.user_id = target
  ), picked as (
    select b.id, b.user_id, b.change, b.reason, b.detail, b.series_id, b.debt_paid, b.created_at, b.balance,
      coalesce(nullif(btrim(p.nickname), ''), '닉네임 없음') as nickname
    from base b left join profiles p on p.user_id = b.user_id
    where (reason_filter is null or b.reason = reason_filter) and (since is null or b.created_at >= since)
  )
  select json_build_object(
    'total', (select count(*) from picked),
    'rows', coalesce((select json_agg(x) from (select * from picked order by id desc limit lim offset off) x), '[]'::json)
  ) into result;
  return result;
end $$;

-- 뽑기 기록 (뽑은 무기·등급·이미 가진 무기였는지·돌려받은 양). grade_filter: common·rare·heroic·shard
create or replace function admin_draw_log(target uuid default null, grade_filter text default null,
  since timestamptz default null, lim int default 30, off int default 0) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  result json;
begin
  perform assert_admin();
  with draws as (
    select d.id, d.user_id, d.detail as weapon_id, d.created_at,
      case when d.detail = 'shard' then 'shard' else g.grade end as grade,
      r.change as refund
    from key_ledger d
    left join gacha_pool g on g.weapon_id = d.detail
    -- 돌려받기는 같은 뽑기 안(같은 시각)에 같은 무기로 적힌다
    left join lateral (select change from key_ledger r where r.user_id = d.user_id and r.reason = 'refund'
                       and r.detail = d.detail and r.created_at = d.created_at limit 1) r on true
    where d.reason = 'draw' and (target is null or d.user_id = target) and (since is null or d.created_at >= since)
  ), picked as (
    select dr.*, dr.refund is not null as duplicate, coalesce(nullif(btrim(p.nickname), ''), '닉네임 없음') as nickname
    from draws dr left join profiles p on p.user_id = dr.user_id
    where grade_filter is null or dr.grade = grade_filter
  )
  select json_build_object(
    'total', (select count(*) from picked),
    'rows', coalesce((select json_agg(x) from (select * from picked order by id desc limit lim offset off) x), '[]'::json)
  ) into result;
  return result;
end $$;

-- 뽑기 통계: 오늘(한국 날짜) 지급·회수·뽑기, 기간(since부터, 비어 있으면 전체)의 등급별 뽑기 수, 지금 남은 열쇠조각 합
create or replace function admin_gacha_stats(since timestamptz default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  today_start timestamptz := kst_today()::timestamp at time zone 'Asia/Seoul';
begin
  perform assert_admin();
  return json_build_object(
    'today', json_build_object(
      'given', (select coalesce(json_object_agg(reason, n), '{}'::json) from (
                 select reason, sum(change) n from key_ledger
                 where created_at >= today_start and change > 0 and reason <> 'refund' group by reason) t),
      'revoked', (select coalesce(-sum(change), 0) from key_ledger where created_at >= today_start and reason in ('admin_revoke', 'review_undo')),
      'draws', (select count(*) from key_ledger where created_at >= today_start and reason = 'draw'),
      'drawers', (select count(distinct user_id) from key_ledger where created_at >= today_start and reason = 'draw')
    ),
    'grades', (select coalesce(json_object_agg(grade, n), '{}'::json) from (
                 select case when d.detail = 'shard' then 'shard' else coalesce(g.grade, 'unknown') end as grade, count(*) n
                 from key_ledger d left join gacha_pool g on g.weapon_id = d.detail
                 where d.reason = 'draw' and (since is null or d.created_at >= since) group by 1) t),
    'wallets', json_build_object(
      'keys', (select coalesce(sum(keys), 0) from key_wallets),
      'shards', (select coalesce(sum(legend_shards), 0) from key_wallets),
      'people', (select count(*) from key_wallets)
    )
  );
end $$;

-- ───────── 조작 점검 ─────────

-- 이항분포 윗꼬리: n번 중 확률 p인 일이 k번 이상 나올 확률 (뽑기 운이 이상하게 좋은 사람 찾기)
create or replace function gacha_upper_tail(n int, k int, p float8) returns float8
language plpgsql immutable as $$
declare
  pmf float8 := power(1 - p, n);
  below float8 := 0;
begin
  if k <= 0 then return 1; end if;
  if k > n then return 0; end if;
  for i in 0 .. k - 1 loop
    below := below + pmf;
    pmf := pmf * (n - i) / (i + 1) * p / (1 - p);
  end loop;
  return greatest(0, 1 - below);
end $$;

-- 사람별로 규칙이 깨진 곳을 찾는다. 기록만 보여 주고 아무것도 고치지 않는다.
-- kind: orphan_weapon(출처 없는 무기)·missing_weapon(뽑았는데 없는 무기)·wallet(열쇠조각 합 불일치)·debt(빚 불일치)·shards(파편 수 불일치)
--       ·daily_twice·review_over·review_series·welcome_twice·draw_cost·negative(잔액이 음수였던 순간)·refund_orphan(뽑기 없는 돌려받기)
--       ·lucky(운이 너무 좋음, 확인 필요)
create or replace function admin_integrity_check() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  issues json;
  tables json;
begin
  perform assert_admin();
  with
  sums as (
    select user_id, sum(change) as total,
      count(*) filter (where reason = 'draw' and detail = 'shard') as shard_draws,
      count(*) filter (where reason = 'shard_exchange') as shard_exchanges -- 파편 3개 → 전설 무기 (gacha.sql)
    from key_ledger group by user_id
  ),
  undo_debt as ( -- 후기 삭제로 생긴 빚 (gacha.sql의 reclaim_review_keys와 같은 계산)
    select u.user_id, sum(r.change + u.change + r.debt_paid) as added
    from key_ledger u join key_ledger r on r.user_id = u.user_id and r.reason = 'review' and r.detail = u.detail
    where u.reason = 'review_undo' group by u.user_id
  ),
  paid_debt as (
    select user_id, sum(debt_paid) as paid from key_ledger where reason = 'review' group by user_id
  ),
  running as (
    select user_id, min(balance) as lowest from (
      select user_id, sum(change) over (partition by user_id order by id) as balance from key_ledger) t
    group by user_id
  ),
  draw_stats as (
    select d.user_id, count(*) as n, count(*) filter (where g.grade = 'heroic') as heroic
    from key_ledger d left join gacha_pool g on g.weapon_id = d.detail
    where d.reason = 'draw' group by d.user_id
  ),
  found as (
    -- 1. 출처 없는 무기
    select w.user_id, 'orphan_weapon' as kind, w.weapon_id as detail from owned_weapons w
    where not exists (select 1 from key_ledger l where l.user_id = w.user_id and l.reason in ('draw', 'weapon_grant', 'shard_exchange') and l.detail = w.weapon_id)
    union all
    -- 1-1. 처음 얻은 뽑기(돌려받기 없음)였는데 무기가 없고 회수 기록도 없음
    select d.user_id, 'missing_weapon', d.detail from key_ledger d
    where d.reason = 'draw' and d.detail <> 'shard'
      and not exists (select 1 from key_ledger r where r.user_id = d.user_id and r.reason = 'refund' and r.detail = d.detail and r.created_at = d.created_at)
      and not exists (select 1 from owned_weapons w where w.user_id = d.user_id and w.weapon_id = d.detail)
      and not exists (select 1 from key_ledger v where v.user_id = d.user_id and v.reason = 'weapon_revoke' and v.detail = d.detail)
    union all
    -- 2. 지갑과 기록의 합이 다름
    select coalesce(k.user_id, s.user_id), 'wallet',
      '지갑 ' || coalesce(k.keys, 0) || '개 · 기록 합 ' || coalesce(s.total, 0) || '개'
    from key_wallets k full join sums s on s.user_id = k.user_id
    where coalesce(k.keys, 0) <> coalesce(s.total, 0)
    union all
    select k.user_id, 'debt', '빚 ' || k.key_debt || '개 · 기록상 ' || (coalesce(a.added, 0) - coalesce(pd.paid, 0)) || '개'
    from key_wallets k left join undo_debt a on a.user_id = k.user_id left join paid_debt pd on pd.user_id = k.user_id
    where k.key_debt <> coalesce(a.added, 0) - coalesce(pd.paid, 0)
    union all
    select k.user_id, 'shards', '파편 ' || k.legend_shards || '개 · 뽑기 기록 ' || coalesce(s.shard_draws, 0) || '번 · 전설 교환 ' || coalesce(s.shard_exchanges, 0) || '번'
    from key_wallets k left join sums s on s.user_id = k.user_id
    where k.legend_shards <> coalesce(s.shard_draws, 0) - 3 * coalesce(s.shard_exchanges, 0)
    union all
    -- 3. 선물을 규칙보다 많이 받음
    select user_id, 'daily_twice', d::text || ' ' || n || '번' from (
      select user_id, (created_at at time zone 'Asia/Seoul')::date d, count(*) n from key_ledger where reason = 'daily' group by 1, 2) t where n > 1
    union all
    select user_id, 'review_over', d::text || ' ' || n || '번' from (
      select user_id, (created_at at time zone 'Asia/Seoul')::date d, count(*) n from key_ledger where reason = 'review' group by 1, 2) t where n > 3
    union all
    select user_id, 'review_series', series_id || ' ' || n || '번' from (
      select user_id, series_id, count(*) n from key_ledger where reason = 'review' and series_id is not null group by 1, 2) t where n > 1
    union all
    select user_id, 'welcome_twice', n || '번' from (
      select user_id, count(*) n from key_ledger where reason = 'welcome' group by 1) t where n > 1
    union all
    -- 4. 비용을 제대로 안 낸 뽑기, 잔액이 음수였던 순간, 뽑기 없는 돌려받기
    select user_id, 'draw_cost', '#' || id || ' ' || change || '개' from key_ledger where reason = 'draw' and change <> -5
    union all
    select user_id, 'negative', '가장 낮았던 잔액 ' || lowest || '개' from running where lowest < 0
    union all
    select r.user_id, 'refund_orphan', '#' || r.id || ' +' || r.change || '개' from key_ledger r
    where r.reason = 'refund'
      and not exists (select 1 from key_ledger d where d.user_id = r.user_id and d.reason = 'draw' and d.detail = r.detail and d.created_at = r.created_at)
    union all
    -- 5. 영웅이 너무 많이 나옴 (뽑기 30번 이상, 우연일 확률 0.1% 미만) — 확인 필요
    select user_id, 'lucky', n || '번 중 영웅 ' || heroic || '개' from draw_stats
    where n >= 30 and gacha_upper_tail(n::int, heroic::int, 0.0099) < 0.001
  )
  select coalesce(json_agg(json_build_object(
      'user_id', f.user_id, 'kind', f.kind, 'detail', f.detail,
      'nickname', coalesce(nullif(btrim(p.nickname), ''), '닉네임 없음'),
      'admin', exists (select 1 from admins a where a.user_id = f.user_id)
    ) order by f.kind = 'lucky', f.user_id, f.kind), '[]'::json)
  into issues
  from found f left join profiles p on p.user_id = f.user_id;

  -- 6. 표 보호 상태: RLS가 켜져 있는지, 로그인한 사람·손님에게 쓰기 권한·쓰기 규칙(policy)이 있는지
  select json_agg(json_build_object(
      'table', t.name,
      'rls', c.relrowsecurity,
      'write_grant', has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('authenticated', c.oid, 'INSERT')
        or has_table_privilege('authenticated', c.oid, 'UPDATE') or has_table_privilege('authenticated', c.oid, 'DELETE'),
      'write_policies', (select count(*) from pg_policies po where po.schemaname = 'public' and po.tablename = t.name
                         and po.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL'))
    ) order by t.name)
  into tables
  from (values ('key_wallets'), ('owned_weapons'), ('key_ledger'), ('gacha_pool')) t(name)
  join pg_class c on c.relname = t.name and c.relnamespace = 'public'::regnamespace;

  return json_build_object('checked_at', now(), 'issues', issues, 'tables', tables,
    'people', (select count(*) from key_wallets));
end $$;

revoke execute on function guard_owned_weapons(), gacha_upper_tail(int, int, float8) from public, anon, authenticated;
revoke execute on function admin_grant_keys(uuid, int, text), admin_revoke_keys(uuid, int, text),
  admin_grant_weapon(uuid, text, text), admin_revoke_weapon(uuid, text, text), admin_user_keys(uuid),
  admin_key_ledger(uuid, text, timestamptz, int, int), admin_draw_log(uuid, text, timestamptz, int, int),
  admin_gacha_stats(timestamptz), admin_integrity_check()
  from public, anon;
grant execute on function admin_grant_keys(uuid, int, text), admin_revoke_keys(uuid, int, text),
  admin_grant_weapon(uuid, text, text), admin_revoke_weapon(uuid, text, text), admin_user_keys(uuid),
  admin_key_ledger(uuid, text, timestamptz, int, int), admin_draw_log(uuid, text, timestamptz, int, int),
  admin_gacha_stats(timestamptz), admin_integrity_check()
  to authenticated;
