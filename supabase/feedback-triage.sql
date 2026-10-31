-- 문의 유형 늘리기와 AI 확인 칸. supabase/admin.sql 다음에 SQL Editor에서 한 번 실행한다. (여러 번 실행해도 괜찮다)
-- AI 확인 칸은 내 컴퓨터의 scripts/triage-feedback.ts만 채운다. 답장은 사람이 쓴다.

alter table feedback drop constraint if exists feedback_category_check;
alter table feedback add constraint feedback_category_check
  check (category in ('버그', '제안', '개인정보 요청', '권리 침해 신고', '기타'));

alter table feedback add column if not exists ai_type text check (char_length(ai_type) <= 20);
alter table feedback add column if not exists ai_urgency text check (ai_urgency in ('high', 'normal', 'low'));
alter table feedback add column if not exists ai_summary text check (char_length(ai_summary) <= 200);
alter table feedback add column if not exists ai_checked_at timestamptz;

-- 쓰는 사람이 AI 칸을 미리 채워 "안 급함"으로 꾸미지 못하게 한다
drop policy if exists "누구나 의견 보내기" on feedback;
create policy "누구나 의견 보내기" on feedback for insert to anon, authenticated
  with check (status = 'new' and admin_note is null and reply is null and replied_at is null and alerted_at is null
              and ai_type is null and ai_urgency is null and ai_summary is null and ai_checked_at is null
              and (user_id is null or user_id = auth.uid()));
