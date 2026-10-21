-- ============================================================
-- 瞳治 · 第 8 步：清理孤儿数据（一次性收尾）
-- 背景：早期测试留下了「孤儿家庭 1350acee…」和「孤儿孩子 ca8938e7…」，
--       现在两个测试账号（doc / test）都已挪到「小明家」，这两条孤儿数据
--       通过 RLS 已经看不见（没任何人负责），但还留在库里。
--       而且 families 表没有 delete 策略，API 删不掉，只能在这里用 SQL 删。
-- 用法：Supabase → SQL Editor → 新建查询 → 先跑【预览】，确认无误再跑【删除】。
-- ============================================================

-- ------------------------------------------------------------
-- 【预览】先跑这段，看清楚孤儿数据长啥样，确认后再跑下面的删除
-- ------------------------------------------------------------
select '孤儿家庭' as 类型, id, name, therapist_id, created_at
from public.families where id::text like '1350acee%';

select '孤儿孩子' as 类型, id, family_id, name, created_at
from public.children
where id::text like 'ca8938e7%' or family_id::text like '1350acee%';

-- 孤儿孩子名下的回传 / 处方 / 自定义训练 各有多少条
select
  (select count(*) from public.records        where child_id in (select id from public.children where id::text like 'ca8938e7%' or family_id::text like '1350acee%')) as 回传记录,
  (select count(*) from public.prescriptions  where child_id in (select id from public.children where id::text like 'ca8938e7%' or family_id::text like '1350acee%')) as 处方,
  (select count(*) from public.custom_projects where child_id in (select id from public.children where id::text like 'ca8938e7%' or family_id::text like '1350acee%')) as 自定义训练;

-- 孤儿孩子在 storage 里的文件（第一段路径 = 孩子id）
select name from storage.objects
where bucket_id = 'media'
  and split_part(name, '/', 1) in (
    select id::text from public.children
    where id::text like 'ca8938e7%' or family_id::text like '1350acee%'
  );


-- ------------------------------------------------------------
-- 【删除】确认上面的预览没问题后，再跑这段（顺序不能乱：先文件→孩子→家庭）
-- ------------------------------------------------------------
-- 1) 删孤儿孩子在 storage 里的文件（SQL 不会自动级联 storage，要单独删）
delete from storage.objects
where bucket_id = 'media'
  and split_part(name, '/', 1) in (
    select id::text from public.children
    where id::text like 'ca8938e7%' or family_id::text like '1350acee%'
  );

-- 2) 删孤儿孩子（会级联删掉它的 records / prescriptions / custom_projects）
delete from public.children
where id::text like 'ca8938e7%' or family_id::text like '1350acee%';

-- 3) 删孤儿家庭
delete from public.families where id::text like '1350acee%';
