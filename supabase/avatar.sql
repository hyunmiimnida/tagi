-- 내 도트 캐릭터(머리 장식·옷·색·무기)를 계정에 저장한다.
-- schema.sql, profile.sql을 실행한 뒤 Supabase의 SQL Editor에 붙여 넣고 한 번 실행한다. (여러 번 실행해도 괜찮다)
-- 실행하기 전에도 캐릭터는 이 기기(브라우저)에 저장되어 동작한다. 실행하면 로그인한 어느 기기에서든 같은 캐릭터가 나온다.

-- 모습은 {"headwear": "...", "headwearColor": "...", "outfit": "...", "outfitColor": "...", "weapon": "..."} 같은 묶음 하나.
-- 어떤 값이 맞는지는 화면 코드(lib/pixel-pals.ts의 toValidAvatar)가 확인하고, 여기서는 묶음 모양과 크기만 막는다.
alter table profiles add column if not exists avatar jsonb
  check (avatar is null or (jsonb_typeof(avatar) = 'object' and pg_column_size(avatar) < 2000));

-- profiles 표는 이미 "내 프로필만" 읽고 쓰게 되어 있어(schema.sql) 다른 사람은 내 캐릭터를 볼 수 없다.
-- 탈퇴하면 profiles 줄과 함께 지워진다.

-- 후기 댓글에 글쓴이 캐릭터 얼굴을 보여 준다 (components/Comments.tsx).
-- 댓글 번호와 캐릭터 모습만 내보내고, 누가 썼는지(계정 번호)는 내보내지 않는다. 숨겨진 댓글은 빼고,
-- 다른 사람의 profiles 줄은 직접 읽을 수 없으므로(RLS) 이 보기(view)를 통해서만 읽는다 (comment_feed와 같은 방식).
create or replace view comment_avatars as
  select c.id as comment_id, p.avatar
  from comments c
  join profiles p on p.user_id = c.user_id
  where not c.hidden and p.avatar is not null;
grant select on comment_avatars to anon, authenticated;
