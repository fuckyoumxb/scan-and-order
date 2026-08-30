-- ============================================================
-- 扫码点餐 PWA · Supabase 数据层
-- 在 Supabase 控制台 → SQL Editor 中「整体执行」本文件即可。
-- ============================================================

-- 1) 菜单表：单行配置，id 固定为 1，data 为分类数组(JSONB)
create table if not exists menu (
  id          int          primary key,
  data        jsonb        not null default '[]'::jsonb,
  updated_at  timestamptz  not null default now()
);

-- 2) 订单表
create table if not exists orders (
  id          uuid          primary key default gen_random_uuid(),
  table       text          not null default '0',
  items       jsonb         not null default '[]'::jsonb,
  total       numeric       not null default 0,
  count       int           not null default 0,
  note        text          not null default '',
  status      text          not null default 'pending',
  urge        boolean       not null default false,
  paid        boolean       not null default false,
  created_at  timestamptz   not null default now()
);
create index if not exists orders_created_at_idx on orders (created_at);

-- 2.5) 每日点餐序号：按自然日从 1 自增，由触发器自动分配。
--      顾客无需桌号，下单后即为「今日第 N 单」，避免前端手动计数并发出错。
alter table orders add column if not exists daily_seq int;
create or replace function set_daily_seq() returns trigger as $$
begin
  new.daily_seq := coalesce(
    (select max(daily_seq) from orders where created_at::date = current_date), 0
  ) + 1;
  return new;
end;
$$ language plpgsql;
drop trigger if exists trg_daily_seq on orders;
create trigger trg_daily_seq
  before insert on orders
  for each row execute function set_daily_seq();

-- 3) 默认菜单种子（仅首次写入；已存在则不覆盖，方便你后台自定义）
insert into menu (id, data) values (1, '[
  {"category":"招牌热菜","items":[
    {"id":"h1","name":"红烧肉","desc":"肥而不腻 入口即化","price":38,"emoji":"🍖","img":""},
    {"id":"h2","name":"宫保鸡丁","desc":"微辣 花生脆爽","price":28,"emoji":"🍗","img":""},
    {"id":"h3","name":"麻婆豆腐","desc":"麻辣鲜香","price":22,"emoji":"🌶️","img":""}
  ]},
  {"category":"主食","items":[
    {"id":"s1","name":"米饭","desc":"东北珍珠米","price":3,"emoji":"🍚","img":""},
    {"id":"s2","name":"牛肉面","desc":"手工拉面","price":18,"emoji":"🍜","img":""}
  ]},
  {"category":"饮品","items":[
    {"id":"d1","name":"可乐","desc":"冰镇 330ml","price":6,"emoji":"🥤","img":""},
    {"id":"d2","name":"鲜榨橙汁","desc":"无添加","price":12,"emoji":"🍊","img":""}
  ]},
  {"category":"甜点","items":[
    {"id":"c1","name":"提拉米苏","desc":"经典意式","price":16,"emoji":"🍰","img":""}
  ]}
]'::jsonb)
on conflict (id) do nothing;

-- 4) 开启 Realtime（顾客端下单 / 后厨推进状态 → 两端实时同步）
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='menu') then
    alter publication supabase_realtime add table menu;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
    alter publication supabase_realtime add table orders;
  end if;
end $$;

-- 5) 行级安全（RLS）。演示环境允许匿名读写；生产环境请加 auth 限制。
alter table menu  enable row level security;
alter table orders enable row level security;

drop policy if exists "menu public read"   on menu;
drop policy if exists "menu public write"  on menu;
drop policy if exists "orders public read"  on orders;
drop policy if exists "orders public write" on orders;

create policy "menu public read"   on menu  for select using (true);
create policy "menu public write"  on menu  for insert with check (true);
create policy "menu public write"  on menu  for update using (true);

create policy "orders public read"  on orders for select using (true);
create policy "orders public write" on orders for insert with check (true);
create policy "orders public write" on orders for update using (true);
create policy "orders public write" on orders for delete using (true);

-- 6) 菜品图片存储桶（公开读、匿名上传）。后台可自主上传菜品图片。
insert into storage.buckets (id, name, public)
values ('dish-images', 'dish-images', true)
on conflict (id) do nothing;

drop policy if exists "dish-images public read"   on storage.objects;
drop policy if exists "dish-images public upload" on storage.objects;
drop policy if exists "dish-images public update" on storage.objects;
drop policy if exists "dish-images public delete" on storage.objects;

create policy "dish-images public read"   on storage.objects for select to anon using (bucket_id = 'dish-images');
create policy "dish-images public upload" on storage.objects for insert to anon with check (bucket_id = 'dish-images');
create policy "dish-images public update" on storage.objects for update to anon using (bucket_id = 'dish-images');
create policy "dish-images public delete" on storage.objects for delete to anon using (bucket_id = 'dish-images');
