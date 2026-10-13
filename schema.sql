-- ============================================================
-- 瞳治视觉训练助手 · 数据库建表 + 安全策略（方案 B / Supabase）
-- 用法：Supabase 控制台 → SQL Editor → 新建查询 → 整段粘贴 → Run
-- ============================================================

-- 开启扩展（生成随机编号用）
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. 用户表 profiles（关联登录账号 auth.users）
--    每个登录账号对应一条档案，role 区分「家长/视训师」
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'parent',   -- 'parent' 家长 / 'therapist' 视训师
  name       text not null default '',
  family_id  uuid,                             -- 家长属于哪个家庭（视训师为空）
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. 家庭表 families（把家长、孩子、视训师绑在一起）
-- ------------------------------------------------------------
create table if not exists public.families (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  therapist_id uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- 补上 profiles.family_id 的外键（因 profiles 与 families 互相引用，拆开后加）
alter table public.profiles
  add constraint profiles_family_id_fkey
  foreign key (family_id) references public.families(id) on delete set null;

-- ------------------------------------------------------------
-- 3. 孩子表 children
-- ------------------------------------------------------------
create table if not exists public.children (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid references public.families(id) on delete cascade,
  name       text not null default '',
  age        int,
  note       text not null default '',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. 处方表 prescriptions（视训师开的训练处方）
-- ------------------------------------------------------------
create table if not exists public.prescriptions (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid references public.children(id) on delete cascade,
  title      text not null default '',
  items      text not null default '',          -- 训练项目
  params     text not null default '',          -- 参数
  note       text not null default '',          -- 注意事项
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. 回传记录表 records（家长回传的训练结果）
--    type: eye眼位 / marsden马斯登 / peripheral周边 / custom自定义
--    data: 训练数据（如命中次数），json 结构
--    media: 照片/视频的存储路径数组，json 结构
-- ------------------------------------------------------------
create table if not exists public.records (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid references public.children(id) on delete cascade,
  type       text not null default '',
  data       jsonb not null default '{}'::jsonb,
  media      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6. 自定义训练表 custom_projects（视训师布置的自定义训练）
-- ------------------------------------------------------------
create table if not exists public.custom_projects (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid references public.children(id) on delete cascade,
  title      text not null default '',
  content    text not null default '',          -- 教程文字
  media      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 开启行级安全（RLS）—— 默认「全部拒绝」，再逐条放行
-- ============================================================
alter table public.profiles       enable row level security;
alter table public.families       enable row level security;
alter table public.children       enable row level security;
alter table public.prescriptions  enable row level security;
alter table public.records        enable row level security;
alter table public.custom_projects enable row level security;

-- ============================================================
-- 安全策略（谁可以看 / 写什么）
-- 核心逻辑：家长只能碰自己家庭的数据；视训师只能碰自己负责家庭的数据
-- ============================================================

-- profiles：读自己的档案；改自己的档案
create policy "profile_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profile_update_own" on public.profiles
  for update using (id = auth.uid());

-- 【安全锁】普通登录用户只能改自己的「name」列，不能改 role / family_id
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

-- families：家长读自己的家庭；视训师读/建自己负责的家庭
create policy "families_select_parent" on public.families for select
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.family_id = families.id));
create policy "families_select_therapist" on public.families for select
  using (therapist_id = auth.uid());
create policy "families_insert_therapist" on public.families for insert
  with check (therapist_id = auth.uid());

-- children：家长读自己家的孩子；视训师读/写自己负责家庭的孩子
create policy "children_select_parent" on public.children for select
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.family_id = children.family_id));
create policy "children_select_therapist" on public.children for select
  using (exists (select 1 from public.families f
                 where f.id = children.family_id and f.therapist_id = auth.uid()));
create policy "children_insert_therapist" on public.children for insert
  with check (exists (select 1 from public.families f
                      where f.id = family_id and f.therapist_id = auth.uid()));
create policy "children_update_therapist" on public.children for update
  using (exists (select 1 from public.families f
                 where f.id = children.family_id and f.therapist_id = auth.uid()));
create policy "children_delete_therapist" on public.children for delete
  using (exists (select 1 from public.families f
                 where f.id = children.family_id and f.therapist_id = auth.uid()));

-- prescriptions：家长读自己孩子的处方；视训师读/写自己负责孩子的处方
create policy "rx_select_parent" on public.prescriptions for select
  using (exists (select 1 from public.children c
                 join public.profiles p on p.id = auth.uid()
                 where c.id = prescriptions.child_id and c.family_id = p.family_id));
create policy "rx_select_therapist" on public.prescriptions for select
  using (exists (select 1 from public.children c
                 join public.families f on f.id = c.family_id
                 where c.id = prescriptions.child_id and f.therapist_id = auth.uid()));
create policy "rx_insert_therapist" on public.prescriptions for insert
  with check (exists (select 1 from public.children c
                      join public.families f on f.id = c.family_id
                      where c.id = child_id and f.therapist_id = auth.uid()));
create policy "rx_update_therapist" on public.prescriptions for update
  using (exists (select 1 from public.children c
                 join public.families f on f.id = c.family_id
                 where c.id = prescriptions.child_id and f.therapist_id = auth.uid()));
create policy "rx_delete_therapist" on public.prescriptions for delete
  using (exists (select 1 from public.children c
                 join public.families f on f.id = c.family_id
                 where c.id = prescriptions.child_id and f.therapist_id = auth.uid()));

-- records：家长读/传自己孩子的记录；视训师读自己负责孩子的记录
create policy "records_select_parent" on public.records for select
  using (exists (select 1 from public.children c
                 join public.profiles p on p.id = auth.uid()
                 where c.id = records.child_id and c.family_id = p.family_id));
create policy "records_insert_parent" on public.records for insert
  with check (exists (select 1 from public.children c
                      join public.profiles p on p.id = auth.uid()
                      where c.id = child_id and c.family_id = p.family_id));
create policy "records_select_therapist" on public.records for select
  using (exists (select 1 from public.children c
                 join public.families f on f.id = c.family_id
                 where c.id = records.child_id and f.therapist_id = auth.uid()));

-- custom_projects：家长读自己孩子的；视训师读/写自己负责孩子的
create policy "cp_select_parent" on public.custom_projects for select
  using (exists (select 1 from public.children c
                 join public.profiles p on p.id = auth.uid()
                 where c.id = custom_projects.child_id and c.family_id = p.family_id));
create policy "cp_select_therapist" on public.custom_projects for select
  using (exists (select 1 from public.children c
                 join public.families f on f.id = c.family_id
                 where c.id = custom_projects.child_id and f.therapist_id = auth.uid()));
create policy "cp_insert_therapist" on public.custom_projects for insert
  with check (exists (select 1 from public.children c
                      join public.families f on f.id = c.family_id
                      where c.id = child_id and f.therapist_id = auth.uid()));
create policy "cp_update_therapist" on public.custom_projects for update
  using (exists (select 1 from public.children c
                 join public.families f on f.id = c.family_id
                 where c.id = custom_projects.child_id and f.therapist_id = auth.uid()));
create policy "cp_delete_therapist" on public.custom_projects for delete
  using (exists (select 1 from public.children c
                 join public.families f on f.id = c.family_id
                 where c.id = custom_projects.child_id and f.therapist_id = auth.uid()));

-- ============================================================
-- 触发器：新用户注册后，自动在 profiles 建一条档案（默认身份=家长）
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, name)
  values (new.id, 'parent', coalesce(new.raw_user_meta_data->>'name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
