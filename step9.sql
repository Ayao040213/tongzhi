-- ============================================================
-- 瞳治 · 第 9 步：正式版身份授权（视训师授权码）
-- 背景：之前测试靠 SQL 固定两个账号身份；become_therapist() 又因
--       「谁都能一键自封视训师」被删。现在补正式机制：
--       注册时选「视训师」+ 输入授权码，码对才给 therapist 身份。
--       授权码存在数据库 app_settings 表里，不进代码库（代码库是公开的）。
-- 用法（两步）：
--   1) 整段粘贴 Run：建 app_settings 表 + register_therapist 函数
--   2) 单独跑一句（★别提交进代码库★）设置你的授权码：
--        insert into public.app_settings (key, value)
--        values ('therapist_code', '换成你自己的授权码')
--        on conflict (key) do update set value = excluded.value;
-- ============================================================

-- 1. 设置表：存授权码等敏感值。
--    开启 RLS 但不给任何策略 = 任何登录用户都读不到（只能函数以 owner 身份读）
create table if not exists public.app_settings (
  key   text primary key,
  value text not null default ''
);
alter table public.app_settings enable row level security;

-- 2. 注册为视训师：校验授权码，对了才把自己升级成 therapist
--    security definer = 以函数所有者(postgres)身份跑，能读 app_settings（绕过 RLS）；
--    但只改「自己」那一行（id = auth.uid()），不影响别人。
create or replace function public.register_therapist(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  select value into v_code from public.app_settings where key = 'therapist_code';
  if v_code is null or v_code = '' then
    raise exception '视训师授权未开启，请联系管理员';
  end if;
  if p_code is null or p_code <> v_code then
    return false;   -- 授权码不对
  end if;
  update public.profiles set role = 'therapist' where id = auth.uid();
  return true;
end;
$$;

-- 3. 只允许「已登录用户」调用（匿名/未登录调不了）
revoke execute on function public.register_therapist(text) from public;
grant execute on function public.register_therapist(text) to authenticated;
