-- ============================================================
-- 瞳治 · 第 5 步：补 records 表的「更新」权限
-- 问题：家长回传照片后，要「更新」记录把照片地址存进 media，
--       但 records 表之前没建 update 策略，导致 media 存不上、视训师看不到图。
-- 用法：Supabase → SQL Editor → 新建查询 → 整段粘贴 → Run
-- ============================================================

drop policy if exists "records_update_parent" on public.records;
create policy "records_update_parent" on public.records for update
  using (
    exists (select 1 from public.children c
            join public.profiles p on p.id = auth.uid()
            where c.id = records.child_id and c.family_id = p.family_id)
  )
  with check (
    exists (select 1 from public.children c
            join public.profiles p on p.id = auth.uid()
            where c.id = child_id and c.family_id = p.family_id)
  );
