-- ============================================================
-- 瞳治 · 第 7 步：补「删除」权限
-- 之前 records 表和 storage 都只有 select/insert/update，没有 delete，
-- 导致测试数据、传错的东西删不掉。这里补上家长/视训师的删除权限。
-- 用法：Supabase → SQL Editor → 新建查询 → 整段粘贴 → Run
-- ============================================================

-- 1) 回传记录 records：家长删自己家孩子的、视训师删自己负责家庭的
drop policy if exists "records_delete_parent" on public.records;
create policy "records_delete_parent" on public.records for delete
  using (exists (select 1 from public.children c
                 join public.profiles p on p.id = auth.uid()
                 where c.id = records.child_id and c.family_id = p.family_id));

drop policy if exists "records_delete_therapist" on public.records;
create policy "records_delete_therapist" on public.records for delete
  using (exists (select 1 from public.children c
                 join public.families f on f.id = c.family_id
                 where c.id = records.child_id and f.therapist_id = auth.uid()));

-- 2) 存储文件 storage：家长删自己家孩子的、视训师删自己负责家庭的
drop policy if exists "media_delete_parent" on storage.objects;
create policy "media_delete_parent" on storage.objects
  for delete using (
    bucket_id = 'media'
    and split_part(name, '/', 1) in (
      select c.id::text from public.children c
      join public.profiles p on p.id = auth.uid()
      where c.family_id = p.family_id
    )
  );

drop policy if exists "media_delete_therapist" on storage.objects;
create policy "media_delete_therapist" on storage.objects
  for delete using (
    bucket_id = 'media'
    and split_part(name, '/', 1) in (
      select c.id::text from public.children c
      join public.families f on f.id = c.family_id
      where f.therapist_id = auth.uid()
    )
  );
