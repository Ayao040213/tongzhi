-- ============================================================
-- 瞳治 · 第 2 步：最小闭环所需（加邀请码字段 + 三个函数）
-- 用法：Supabase → SQL Editor → 新建查询 → 粘贴 → Run
-- ============================================================

-- 1. 给 families 表「加一个字段」invite_code（演示：以后想加字段就这样加）
alter table public.families add column if not exists invite_code text;

-- 2. 插入家庭时，自动生成 6 位数字邀请码
create or replace function public.gen_family_code()
returns trigger language plpgsql as $$
begin
  new.invite_code := lpad(floor(random()*1000000)::int::text, 6, '0');
  return new;
end;
$$;
drop trigger if exists families_gen_code on public.families;
create trigger families_gen_code
  before insert on public.families
  for each row execute procedure public.gen_family_code();

-- 3. 家长凭邀请码加入家庭（security definer：能改 family_id，普通用户改不了）
create or replace function public.join_family(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
begin
  select id into fid from public.families where invite_code = p_code;
  if fid is null then
    raise exception '邀请码不存在，请核对后重试';
  end if;
  update public.profiles set family_id = fid where id = auth.uid();
end;
$$;

-- 4. 【测试用】一键把自己变成视训师
--    ⚠️ 这只是为了现在方便测试两个身份；正式上线前必须删掉、
--    改成「管理员授权」，否则任何人都能自封视训师（越权漏洞）。
create or replace function public.become_therapist()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = 'therapist' where id = auth.uid();
end;
$$;
