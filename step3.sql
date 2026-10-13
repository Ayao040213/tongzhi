-- ============================================================
-- 第 2 步修正：固定两个测试账号的身份，删掉「一键变视训师」接口
-- 用法：Supabase → SQL Editor → 新建查询 → 粘贴 → Run
-- ============================================================

-- 1. 家长 test@test.com（改回家长）
update public.profiles set role = 'parent'
where id = (select id from auth.users where email = 'test@test.com');

-- 2. 视训师 doc@test.com（固定为视训师）
update public.profiles set role = 'therapist'
where id = (select id from auth.users where email = 'doc@test.com');

-- 3. 删掉临时的「一键变视训师」接口（前端已不用，留着是隐患）
drop function if exists public.become_therapist();
