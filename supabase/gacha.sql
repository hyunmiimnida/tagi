-- 무기 뽑기(보물상자)와 열쇠조각. 화면 규칙은 lib/gacha.ts와 같다 (숫자를 바꾸면 둘 다 바꾼다).
-- schema.sql, spam.sql을 실행한 뒤 Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다. (여러 번 실행해도 괜찮다)
-- 실행하기 전에는 화면의 뽑기 칸이 "준비 중"으로 보이고 나머지는 그대로 동작한다.
--
-- 열쇠조각: 하루 첫 접속 5개(한국 날짜), 후기 댓글 하나 5개(하루 3번까지, 지운 댓글도 셈). 10개 = 뽑기 한 번.
-- 확률: 일반 80% / 희귀 19% / 영웅 0.99% / 전설의 파편 0.01%. 등급 안에서는 무기마다 같은 확률.
-- 이미 가진 무기가 나오면 열쇠조각을 돌려준다: 일반 2, 희귀 5, 영웅 10. 처음부터 가진 무기는 맨손 하나뿐이다.
-- 뽑기·지급은 모두 아래 함수(security definer)만 한다. 사람은 자기 줄을 읽기만 할 수 있어 열쇠조각을 고쳐 쓸 수 없다.

-- 내 열쇠조각과 전설의 파편
create table if not exists key_wallets (
  user_id uuid primary key references auth.users on delete cascade,
  keys int not null default 0 check (keys >= 0),
  legend_shards int not null default 0 check (legend_shards >= 0),
  last_daily date, -- 접속 선물을 마지막으로 받은 날 (한국 날짜)
  updated_at timestamptz not null default now()
);

-- 얻은 무기 (맨손 말고 전부)
create table if not exists owned_weapons (
  user_id uuid not null references auth.users on delete cascade,
  weapon_id text not null,
  obtained_at timestamptz not null default now(),
  primary key (user_id, weapon_id)
);

-- 열쇠조각이 바뀐 기록 (후기 선물 하루 횟수도 여기서 센다)
create table if not exists key_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  change int not null,
  reason text not null check (reason in ('daily', 'review', 'draw', 'refund')),
  detail text, -- 뽑기 결과(무기 id, shard) 또는 댓글 번호
  created_at timestamptz not null default now()
);
create index if not exists key_ledger_user_idx on key_ledger (user_id, reason, created_at desc);

-- 뽑기에 나오는 무기 (lib/weapons.ts의 무기와 등급. 맨손·전설 자리는 빼고). 무기를 더하면 여기에도 한 줄
create table if not exists gacha_pool (
  weapon_id text primary key,
  grade text not null check (grade in ('common', 'rare', 'heroic'))
);
insert into gacha_pool (weapon_id, grade) values
  ('wooden-sword', 'common'), ('apprentice-wand', 'common'), ('short-bow', 'common'),
  ('oak-staff', 'common'), ('pencil', 'common'), ('recorder', 'common'),
  ('azure-blade', 'rare'), ('starlight-wand', 'rare'), ('wind-bow', 'rare'), ('radiant-staff', 'rare'),
  ('fountain-pen', 'rare'), ('guitar', 'rare'), ('zip-blade', 'rare'), ('dalgona-wand', 'rare'),
  ('post-bow', 'rare'), ('lucky-key', 'rare'), ('correction-pen', 'rare'), ('castanets', 'rare'),
  ('blossom-blade', 'heroic'), ('tide-staff', 'heroic'), ('meteor-bow', 'heroic'), ('angel-scepter', 'heroic'),
  ('victory-quill', 'heroic'), ('grand-harp', 'heroic'), ('hour-blade', 'heroic'), ('glasshouse-staff', 'heroic'),
  ('loom-bow', 'heroic'), ('promise-compass', 'heroic'), ('drafting-pen', 'heroic'), ('campus-xylophone', 'heroic')
on conflict (weapon_id) do update set grade = excluded.grade;

alter table key_wallets enable row level security;
alter table owned_weapons enable row level security;
alter table key_ledger enable row level security;
alter table gacha_pool enable row level security;

drop policy if exists "내 열쇠조각만 보기" on key_wallets;
create policy "내 열쇠조각만 보기" on key_wallets for select using (auth.uid() = user_id);
drop policy if exists "내 무기만 보기" on owned_weapons;
create policy "내 무기만 보기" on owned_weapons for select using (auth.uid() = user_id);
drop policy if exists "내 기록만 보기" on key_ledger;
create policy "내 기록만 보기" on key_ledger for select using (auth.uid() = user_id);
drop policy if exists "뽑기 목록은 누구나 보기" on gacha_pool;
create policy "뽑기 목록은 누구나 보기" on gacha_pool for select using (true);

create or replace function kst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- 지갑 줄을 (없으면 만들어) 잠그고 돌려준다. 같은 사람이 동시에 두 번 뽑아도 차례로 처리된다
create or replace function lock_wallet(target uuid) returns key_wallets
language plpgsql security definer set search_path = public as $$
declare wallet key_wallets;
begin
  insert into key_wallets (user_id) values (target) on conflict (user_id) do nothing;
  select * into wallet from key_wallets where user_id = target for update;
  return wallet;
end $$;

-- 하루 첫 접속 선물. 화면이 로그인할 때마다 부르고, 오늘 이미 받았으면 0개
create or replace function claim_daily_keys() returns json
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wallet key_wallets;
  granted int := 0;
begin
  if me is null then raise exception 'login required'; end if;
  wallet := lock_wallet(me);
  if wallet.last_daily is distinct from kst_today() then
    granted := 5;
    update key_wallets set keys = keys + granted, last_daily = kst_today(), updated_at = now()
      where user_id = me returning * into wallet;
    insert into key_ledger (user_id, change, reason) values (me, granted, 'daily');
  end if;
  return json_build_object('granted', granted, 'keys', wallet.keys, 'shards', wallet.legend_shards);
end $$;

-- 뽑기 한 번: 열쇠조각 10개를 쓰고 등급 → 그 등급의 무기 하나. 결과를 돌려준다
create or replace function draw_weapon() returns json
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wallet key_wallets;
  roll int;
  picked_grade text;
  picked text;
  duplicate boolean := false;
  refund int := 0;
begin
  if me is null then raise exception 'login required'; end if;
  wallet := lock_wallet(me);
  if wallet.keys < 10 then raise exception 'gacha:not-enough'; end if;

  roll := floor(random() * 10000)::int; -- 0 ~ 9999
  picked_grade := case when roll < 8000 then 'common' when roll < 9900 then 'rare' when roll < 9999 then 'heroic' else 'shard' end;

  if picked_grade = 'shard' then
    update key_wallets set keys = keys - 10, legend_shards = legend_shards + 1, updated_at = now()
      where user_id = me returning * into wallet;
    insert into key_ledger (user_id, change, reason, detail) values (me, -10, 'draw', 'shard');
    return json_build_object('kind', 'shard', 'keys', wallet.keys, 'shards', wallet.legend_shards);
  end if;

  select weapon_id into picked from gacha_pool where grade = picked_grade order by random() limit 1;
  duplicate := exists (select 1 from owned_weapons where user_id = me and weapon_id = picked);
  update key_wallets set keys = keys - 10, updated_at = now() where user_id = me;
  insert into key_ledger (user_id, change, reason, detail) values (me, -10, 'draw', picked);
  if duplicate then
    refund := case picked_grade when 'common' then 2 when 'rare' then 5 else 10 end;
    update key_wallets set keys = keys + refund where user_id = me;
    insert into key_ledger (user_id, change, reason, detail) values (me, refund, 'refund', picked);
  else
    insert into owned_weapons (user_id, weapon_id) values (me, picked);
  end if;
  select * into wallet from key_wallets where user_id = me;
  return json_build_object('kind', 'weapon', 'weapon', picked, 'grade', picked_grade, 'duplicate', duplicate,
    'refund', refund, 'keys', wallet.keys, 'shards', wallet.legend_shards);
end $$;

-- 후기 댓글 선물: 댓글이 저장되면(도배 막기·이용 정지를 통과한 뒤) 하루 3번까지 5개씩
create or replace function reward_review_keys() returns trigger
language plpgsql security definer set search_path = public as $$
declare given int;
begin
  perform lock_wallet(new.user_id);
  select count(*) into given from key_ledger
    where user_id = new.user_id and reason = 'review'
      and created_at >= (kst_today()::timestamp at time zone 'Asia/Seoul');
  if given < 3 then
    update key_wallets set keys = keys + 5, updated_at = now() where user_id = new.user_id;
    insert into key_ledger (user_id, change, reason, detail) values (new.user_id, 5, 'review', new.id::text);
  end if;
  return new;
end $$;

drop trigger if exists comments_reward_keys on comments;
create trigger comments_reward_keys after insert on comments
  for each row execute function reward_review_keys();

-- 함수는 로그인한 사람만 부른다 (lock_wallet·reward_review_keys는 안에서만 쓰므로 막아 둔다)
revoke execute on function lock_wallet(uuid), reward_review_keys() from public, anon, authenticated;
revoke execute on function claim_daily_keys(), draw_weapon() from public, anon;
grant execute on function claim_daily_keys(), draw_weapon() to authenticated;
