-- ============================================================
-- 瞳治 · 第 4 步：照片/视频上传（Storage）· 修正第 2 版
-- 用法：Supabase → SQL Editor → 新建查询 → 整段粘贴 → Run
-- ⚠️ 关键：不要写 alter table storage.objects ...
--    （storage.objects 的 RLS 默认已开；且 Supabase 2025 起
--      不允许 postgres 角色改 storage.objects 的表结构，
--      写了会报 must be owner of table objects，导致后面策略不执行）
-- ============================================================

-- 1. 建存储桶 media（若你已经手动建过，这行 on conflict 会自动跳过，无害）
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- 2. 权限策略。目录固定为「孩子id / 记录id / 文件名」，
--    split_part(name, '/', 1) 取到的第一段 = 孩子id

-- 家长：能给自己家的孩子上传（insert）
drop policy if exists "media_insert_parent" on storage.objects;
create policy "media_insert_parent" on storage.objects
  for insert with check (
    bucket_id = 'media'
    and split_part(name, '/', 1) in (
      select c.id::text from public.children c
      join public.profiles p on p.id = auth.uid()
      where c.family_id = p.family_id
    )
  );

-- 家长：能读（下载）自己家孩子的文件（select）
drop policy if exists "media_select_parent" on storage.objects;
create policy "media_select_parent" on storage.objects
  for select using (
    bucket_id = 'media'
    and split_part(name, '/', 1) in (
      select c.id::text from public.children c
      join public.profiles p on p.id = auth.uid()
      where c.family_id = p.family_id
    )
  );

-- 视训师：能读（下载）自己负责家庭的孩子的文件（select）
drop policy if exists "media_select_therapist" on storage.objects;
create policy "media_select_therapist" on storage.objects
  for select using (
    bucket_id = 'media'
    and split_part(name, '/', 1) in (
      select c.id::text from public.children c
      join public.families f on f.id = c.family_id
      where f.therapist_id = auth.uid()
    )
  );
