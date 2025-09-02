-- 修复 comments 表的 RLS 以符合设计：
-- 读：全部允许；写：仅本人插入；不允许更新/删除
alter table public.comments enable row level security;
drop policy if exists comments_select_all on public.comments;
create policy comments_select_all on public.comments for
select using (true);
drop policy if exists comments_insert_self on public.comments;
create policy comments_insert_self on public.comments for
insert to authenticated with check (auth.uid() = user_id);
-- 不创建 update/delete 策略（即禁止）