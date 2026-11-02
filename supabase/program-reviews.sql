-- 실행 순서: schema → moderation → spam → profile → avatar → program-reports → notify → admin → insert-guard → gacha → comment-threads → 이 파일.
-- comment-threads.sql의 삭제 함수 보완도 함께 적용한다. 여러 번 실행해도 글·점수·보상 기록을 유지한다.
-- 별점은 후기 원글과 함께 comments에 저장한다. program_reviews 표와 별도 보상은 만들지 않는다.
begin;

alter table comments add column if not exists program_id text;
alter table comments add column if not exists participation text;
alter table comments add column if not exists rating_overall integer;
alter table comments add column if not exists rating_content integer;
alter table comments add column if not exists rating_apply integer;
alter table comments add column if not exists rating_operation integer;
alter table comments add column if not exists rating_schedule integer;
alter table comments add column if not exists rating_benefit integer;
alter table comments add column if not exists again text;

-- 운영 DB에 예전 답글 함수가 설치돼 있어도 이 파일만으로 삭제 처리를 갱신한다.
-- comment-threads.sql에도 같은 처리를 유지한다 (그 파일은 새 칸이 없을 때도 실행 가능).
create or replace function preserve_comment_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update admin_log set detail = null where target = '#' || old.id
    and action in ('댓글 숨기기', '댓글 지우기', '신고 정리(문제 없음)', '댓글 다시 보이기');
  if old.parent_id is not null then
    perform 1 from comments where id = old.parent_id for update;
  elsif exists (select 1 from comments where parent_id = old.id) then
    if not old.deleted then
      delete from reports where comment_id = old.id;
      update comments set body = '', user_id = null, deleted = true, hidden = false, reviewed_at = null,
        program_id = null, participation = null, rating_overall = null, rating_content = null,
        rating_apply = null, rating_operation = null, rating_schedule = null, rating_benefit = null, again = null
        where id = old.id;
    end if;
    return null;
  end if;
  return old;
end $$;
revoke execute on function preserve_comment_thread() from public, anon, authenticated;

create or replace function guard_program_review() returns trigger
language plpgsql security invoker set search_path = public as $$
declare score integer;
begin
  -- 답글 종류가 원글과 같아진 뒤 검사한다. 예전 화면의 program_id 없는 후기도 허용한다.
  if new.parent_id is not null or new.kind <> 'review' or new.program_id is null then
    new.program_id := null;
    new.participation := null;
    new.rating_overall := null;
    new.rating_content := null;
    new.rating_apply := null;
    new.rating_operation := null;
    new.rating_schedule := null;
    new.rating_benefit := null;
    new.again := null;
    return new;
  end if;
  if btrim(new.program_id) = '' then raise exception 'rating:round'; end if;
  if new.participation is null or new.participation not in ('joined', 'not_selected', 'dropped') then
    raise exception 'rating:participation';
  end if;
  if new.participation = 'joined' then
    if new.rating_overall is null then raise exception 'rating:overall'; end if;
    if new.again is not null and new.again not in ('yes', 'no', 'unsure') then raise exception 'rating:again'; end if;
  else
    new.rating_overall := null;
    new.rating_content := null;
    new.rating_operation := null;
    new.rating_schedule := null;
    new.rating_benefit := null;
    new.again := null;
  end if;
  foreach score in array array[new.rating_overall, new.rating_content, new.rating_apply,
    new.rating_operation, new.rating_schedule, new.rating_benefit] loop
    if score is not null and score not between 1 and 5 then raise exception 'rating:range'; end if;
  end loop;
  return new;
end $$;
-- 같은 BEFORE INSERT는 이름순: aa(시각) → ab(답글) → ac(별점) → spam.
drop trigger if exists comments_ac_guard_review on comments;
create trigger comments_ac_guard_review before insert on comments for each row execute function guard_program_review();
revoke execute on function guard_program_review() from public, anon, authenticated;

-- 관리자 UPDATE에서도 범위 밖 점수나 삭제된 글의 점수를 남길 수 없다.
alter table comments drop constraint if exists comments_review_check;
alter table comments add constraint comments_review_check check (
  (rating_overall is null or rating_overall between 1 and 5)
  and (rating_content is null or rating_content between 1 and 5)
  and (rating_apply is null or rating_apply between 1 and 5)
  and (rating_operation is null or rating_operation between 1 and 5)
  and (rating_schedule is null or rating_schedule between 1 and 5)
  and (rating_benefit is null or rating_benefit between 1 and 5)
  and (
    (program_id is null and participation is null and rating_overall is null and rating_content is null
      and rating_apply is null and rating_operation is null and rating_schedule is null and rating_benefit is null and again is null)
    or (program_id is not null and btrim(program_id) <> '' and kind = 'review' and parent_id is null and not deleted
      and participation is not null and participation in ('joined', 'not_selected', 'dropped')
      and ((participation = 'joined' and rating_overall is not null and (again is null or again in ('yes', 'no', 'unsure')))
        or (participation <> 'joined' and rating_overall is null and rating_content is null
          and rating_operation is null and rating_schedule is null and rating_benefit is null and again is null)))
  )
);
create unique index if not exists comments_user_program_review on comments (user_id, program_id)
  where kind = 'review' and parent_id is null and program_id is not null and not deleted;
create index if not exists comments_review_summary_idx on comments (series_id, program_id)
  where kind = 'review' and parent_id is null and program_id is not null and not deleted and not hidden;

-- 표를 직접 읽지 못하게 하고, 통계만 owner 권한으로 공개한다. security_barrier로 집계 전 행의 노출을 막는다.
-- comment_feed에는 점수·참여 정보를 추가하지 않는다.
-- 공개 뷰는 묶음 전체만 반환하며 서로 다른 참여자 3명이 필요하다.
-- 한 사람이 여러 회차에 쓴 것으로 이 기준을 채울 수 없다.
alter table comments enable row level security;
revoke select on comments from public, anon, authenticated;
create or replace view review_summary with (security_barrier = true) as
select series_id, null::text as program_id,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then count(*) end as response_count,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then count(rating_overall) end as rating_count,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then round(avg(rating_overall), 1) end as overall_avg,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then array[
    count(*) filter (where rating_overall = 1), count(*) filter (where rating_overall = 2),
    count(*) filter (where rating_overall = 3), count(*) filter (where rating_overall = 4),
    count(*) filter (where rating_overall = 5)] end as distribution,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then round(avg(rating_content), 1) end as content_avg,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then count(rating_content) end as content_count,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then round(avg(rating_apply), 1) end as apply_avg,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then count(rating_apply) end as apply_count,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then round(avg(rating_operation), 1) end as operation_avg,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then count(rating_operation) end as operation_count,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then round(avg(rating_schedule), 1) end as schedule_avg,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then count(rating_schedule) end as schedule_count,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then round(avg(rating_benefit), 1) end as benefit_avg,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then count(rating_benefit) end as benefit_count,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then
    (count(*) filter (where again = 'yes'))::numeric / nullif(count(again), 0) end as again_rate,
  case when count(distinct user_id) filter (where rating_overall is not null) >= 3 then count(again) end as again_count
from comments
where kind = 'review' and parent_id is null and program_id is not null and not hidden and not deleted
group by series_id;
revoke all on review_summary from public, anon, authenticated;
grant select on review_summary to anon, authenticated;

-- 회차별 집계는 관리자 함수로만 읽는다. 공개 뷰와 같은 칸을 반환한다.
create or replace function admin_review_rounds(target_series text) returns setof review_summary
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return query
    select c.series_id, c.program_id,
      count(*) as response_count, count(c.rating_overall) as rating_count,
      round(avg(c.rating_overall), 1) as overall_avg,
      array[count(*) filter (where c.rating_overall = 1), count(*) filter (where c.rating_overall = 2),
        count(*) filter (where c.rating_overall = 3), count(*) filter (where c.rating_overall = 4),
        count(*) filter (where c.rating_overall = 5)] as distribution,
      round(avg(c.rating_content), 1), count(c.rating_content),
      round(avg(c.rating_apply), 1), count(c.rating_apply),
      round(avg(c.rating_operation), 1), count(c.rating_operation),
      round(avg(c.rating_schedule), 1), count(c.rating_schedule),
      round(avg(c.rating_benefit), 1), count(c.rating_benefit),
      (count(*) filter (where c.again = 'yes'))::numeric / nullif(count(c.again), 0), count(c.again)
    from comments c
    where c.series_id = target_series and c.kind = 'review' and c.parent_id is null
      and c.program_id is not null and not c.hidden and not c.deleted
    group by c.series_id, c.program_id
    order by c.program_id;
end $$;
revoke execute on function admin_review_rounds(text) from public, anon, authenticated;
grant execute on function admin_review_rounds(text) to authenticated;
commit;
