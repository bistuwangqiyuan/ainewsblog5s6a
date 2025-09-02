-- 核心表结构（根据 DESIGN 文档）
create table if not exists news_items (
    id uuid primary key default gen_random_uuid(),
    title text,
    summary text,
    content text,
    url text unique,
    source text,
    tags text [],
    published_at timestamptz,
    created_at timestamptz default now(),
    score numeric
);
create table if not exists posts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    type text check (type in ('forum', 'qa')) not null,
    title text not null,
    body text not null,
    media_urls text [],
    views_count int default 0,
    created_at timestamptz default now()
);
create table if not exists comments (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references posts(id) on delete cascade,
    user_id uuid not null,
    content text not null,
    created_at timestamptz default now()
);
create table if not exists likes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    target_type text check (target_type in ('post', 'comment', 'news')) not null,
    target_id uuid not null,
    created_at timestamptz default now(),
    unique (user_id, target_type, target_id)
);
create table if not exists favorites (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    target_type text check (target_type in ('post', 'news')) not null,
    target_id uuid not null,
    created_at timestamptz default now(),
    unique (user_id, target_type, target_id)
);
create table if not exists reports (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    target_type text check (target_type in ('post', 'comment', 'news')) not null,
    target_id uuid not null,
    reason text,
    created_at timestamptz default now()
);
create table if not exists attachments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    target_type text check (target_type in ('post', 'comment', 'feedback')) not null,
    target_id uuid not null,
    url text not null,
    mime text,
    size int,
    created_at timestamptz default now()
);
create table if not exists feedback (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    title text not null,
    content text not null,
    created_at timestamptz default now()
);
create table if not exists messages (
    id uuid primary key default gen_random_uuid(),
    sender_id uuid not null,
    receiver_id uuid not null,
    body text not null,
    created_at timestamptz default now(),
    read_at timestamptz
);
create table if not exists notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    type text not null,
    payload jsonb,
    created_at timestamptz default now(),
    read_at timestamptz
);
create table if not exists profiles (
    user_id uuid primary key,
    nickname text,
    avatar_url text,
    bio text,
    total_points int default 0,
    level int default 1,
    views_count int default 0
);
create table if not exists points_ledger (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    event text not null,
    delta int not null,
    meta jsonb,
    created_at timestamptz default now()
);
create table if not exists user_levels (
    level int primary key,
    name text,
    min_points int not null
);
-- 默认等级种子
insert into user_levels(level, name, min_points)
values (1, '初识', 0),
    (2, '进阶', 100),
    (3, '熟练', 300),
    (4, '专家', 800),
    (5, '大师', 1500) on conflict (level) do nothing;
-- 建议 RLS（需在 Supabase 控制台启用，并适配项目安全需要）
-- 示例：
-- alter table posts enable row level security;
-- create policy "posts_read_all" on posts for select using (true);
-- create policy "posts_insert_self" on posts for insert with check (auth.uid() = user_id);
-- 对 comments/favorites/likes/reports/attachments/feedback/messages/notifications 类似配置；
-- news_items 的写入仅限服务角色（函数使用 service_role）。
-- 简单的积分触发器（示例：发帖+10，评论+2，被点赞的帖子+1）
-- 注意：在生产环境应改用安全触发器函数并防重复；此处示例化，便于快速上线后验证
create or replace function add_points_on_post() returns trigger as $$ begin
insert into points_ledger(user_id, event, delta, meta)
values (
        new.user_id,
        'post_created',
        10,
        jsonb_build_object('post_id', new.id)
    );
update profiles
set total_points = coalesce(total_points, 0) + 10
where user_id = new.user_id;
perform update_level(new.user_id);
return new;
end;
$$ language plpgsql;
create or replace function add_points_on_comment() returns trigger as $$ begin
insert into points_ledger(user_id, event, delta, meta)
values (
        new.user_id,
        'comment_created',
        2,
        jsonb_build_object('comment_id', new.id)
    );
update profiles
set total_points = coalesce(total_points, 0) + 2
where user_id = new.user_id;
perform update_level(new.user_id);
return new;
end;
$$ language plpgsql;
create or replace function add_points_on_like() returns trigger as $$
declare owner uuid;
begin if new.target_type = 'post' then
select user_id into owner
from posts
where id = new.target_id;
if owner is not null then
insert into points_ledger(user_id, event, delta, meta)
values (
        owner,
        'post_liked',
        1,
        jsonb_build_object('post_id', new.target_id)
    );
update profiles
set total_points = coalesce(total_points, 0) + 1
where user_id = owner;
perform update_level(owner);
end if;
end if;
return new;
end;
$$ language plpgsql;
create or replace function update_level(uid uuid) returns void as $$
declare pts int;
lvl int;
begin
select total_points into pts
from profiles
where user_id = uid;
select max(level) into lvl
from user_levels
where min_points <= coalesce(pts, 0);
if lvl is null then lvl := 1;
end if;
update profiles
set level = lvl
where user_id = uid;
end;
$$ language plpgsql;
drop trigger if exists trg_post_points on posts;
create trigger trg_post_points
after
insert on posts for each row execute function add_points_on_post();
drop trigger if exists trg_comment_points on comments;
create trigger trg_comment_points
after
insert on comments for each row execute function add_points_on_comment();
drop trigger if exists trg_like_points on likes;
create trigger trg_like_points
after
insert on likes for each row execute function add_points_on_like();