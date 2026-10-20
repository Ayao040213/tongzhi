-- ============================================================
-- 瞳治 · 第 6 步：给视训师开「上传自定义训练教程素材」的权限
-- 用途：自定义训练功能里，教程的图片/视频是「视训师」上传的。
--       之前 Storage 只允许家长上传（media_insert_parent），
--       所以这里补一条给视训师的 insert 权限。
-- 用法：Supabase → SQL Editor → 新建查询 → 整段粘贴 → Run
-- ============================================================

drop policy if exists "media_insert_therapist" on storage.objects;
create policy "media_insert_therapist" on storage.objects
  for insert with check (
    bucket_id = 'media'
    and split_part(name, '/', 1) in (
      select c.id::text from public.children c
      join public.families f on f.id = c.family_id
      where f.therapist_id = auth.uid()
    )
  );
