### DESIGN — AI 编程新闻网站（架构/数据/接口/流程/页面布局）

#### 整体架构

| 层次 | 说明                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------- |
| 前端 | Astro 页面 + 原生 JS/CSS，调用 Supabase JS SDK 直连 Supabase；调用 Netlify Functions（`crawler.js`, `aiProxy.js`）。 |
| 函数 | Netlify Functions：抓取与 AI 代理，放置于现有 `netlify/` 目录；通过 `netlify.toml` 指定函数目录。                    |
| 数据 | Supabase（Postgres + Storage + Auth + RLS）。                                                                        |

#### 数据模型（表）

| 表名          | 字段（关键）                                                                                          | 约束/索引                               | 说明             |
| ------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------- |
| news_items    | id(pk), title, summary, content, url(unique), source, tags, published_at, created_at, score(optional) | unique(url), idx(published_at desc)     | 抓取资讯。       |
| posts         | id(pk), user_id, type('forum'/'qa'), title, body, media_urls[], created_at                            | idx(type, created_at desc)              | 论坛/问答共用。  |
| comments      | id(pk), post_id, user_id, content, created_at                                                         | idx(post_id, created_at)                | 单层评论。       |
| likes         | id(pk), user_id, target_type('post'/'comment'/'news'), target_id, created_at                          | unique(user_id, target_type, target_id) | 点赞幂等。       |
| favorites     | id(pk), user_id, target_type('post'/'news'), target_id, created_at                                    | unique(user_id, target_type, target_id) | 收藏。           |
| reports       | id(pk), user_id, target_type('post'/'comment'/'news'), target_id, reason, created_at                  | idx(target_type, target_id)             | 举报记录。       |
| attachments   | id(pk), user_id, target_type('post'/'comment'/'feedback'), target_id, url, mime, size, created_at     | idx(user_id, created_at)                | 媒资。           |
| feedback      | id(pk), user_id, title, content, created_at                                                           | idx(user_id, created_at)                | 用户反馈。       |
| messages      | id(pk), sender_id, receiver_id, body, created_at, read_at                                             | idx(receiver_id, created_at)            | 站内私信。       |
| notifications | id(pk), user_id, type, payload(jsonb), created_at, read_at                                            | idx(user_id, created_at)                | 系统通知。       |
| profiles      | user_id(pk), nickname, avatar_url, bio, total_points, level, views_count                              |                                         | 用户档案与统计。 |
| points_ledger | id(pk), user_id, event, delta, created_at, meta(jsonb)                                                | idx(user_id, created_at)                | 积分流水。       |
| user_levels   | level(pk), name, min_points                                                                           |                                         | 等级门槛。       |

注：RLS 策略详述见下。

#### 存储与上传限制

| 项               | 值                             |
| ---------------- | ------------------------------ |
| 图片             | jpg,jpeg,png,gif,webp ≤ 10MB   |
| 视频             | mp4,webm ≤ 10MB                |
| 文档（反馈附件） | pdf,txt,md,doc,docx,zip ≤ 10MB |

前端与函数均需二次校验（MIME + size）。

#### RLS 建议策略（示意）

| 表                                                          | 策略                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| news_items                                                  | 读：all；写：仅服务角色（函数）                                                                            |
| posts/comments/favorites/likes/reports/attachments/feedback | 读：all；insert：auth.uid() = user_id；update/delete：禁止或仅限本人必要字段（本项目中评论与收藏禁改禁删） |
| messages/notifications                                      | 读：本人；写：sender/系统                                                                                  |
| profiles/points_ledger                                      | 读：本人或公开统计；写：仅系统/触发器                                                                      |

#### 接口契约（前端直连 Supabase）

| 功能      | 表                     | 关键动作                                                     |
| --------- | ---------------------- | ------------------------------------------------------------ |
| 登录注册  | Auth                   | `signUp`, `signInWithPassword`, `signOut`                    |
| 新闻列表  | news_items             | `select().order('published_at', {ascending:false}).range()`  |
| 搜索筛选  | news_items             | `ilike('title', '%kw%')`, `eq('source','...')`, 时间范围过滤 |
| 点赞      | likes                  | `upsert({user_id, target_type, target_id})` 唯一约束防重复   |
| 收藏      | favorites              | 同上                                                         |
| 评论      | comments               | `insert({post_id, user_id, content})`                        |
| 举报      | reports                | `insert({...})`                                              |
| 上传      | Storage                | `upload` 后 `getPublicUrl`                                   |
| 积分/等级 | points_ledger/profiles | 读取聚合字段；写入在前端操作完成后追加流水                   |

#### 抓取源列表（20 个）

| 序号 | 名称               | 类型 | 入口                                                                                            | 频率/上限  | 备注                 |
| ---- | ------------------ | ---- | ----------------------------------------------------------------------------------------------- | ---------- | -------------------- |
| 1    | arXiv cs.AI        | RSS  | http://export.arxiv.org/rss/cs.AI                                                               | 每小时抓取 | 标题/摘要/链接/时间  |
| 2    | arXiv cs.CL        | RSS  | http://export.arxiv.org/rss/cs.CL                                                               | 每小时抓取 | 同上                 |
| 3    | arXiv cs.LG        | RSS  | http://export.arxiv.org/rss/cs.LG                                                               | 每小时抓取 | 同上                 |
| 4    | OpenAI Blog        | RSS  | https://openai.com/blog/rss.xml                                                                 | 每日       | 媒体文章             |
| 5    | DeepMind           | RSS  | https://deepmind.google/rss.xml                                                                 | 每日       |                      |
| 6    | Google AI Blog     | Atom | https://ai.googleblog.com/atom.xml                                                              | 每日       |                      |
| 7    | Microsoft Research | RSS  | https://www.microsoft.com/en-us/research/feed/                                                  | 每日       |                      |
| 8    | NVIDIA Blog AI     | RSS  | https://blogs.nvidia.com/blog/category/ai/feed/                                                 | 每日       |                      |
| 9    | Meta AI            | RSS  | https://ai.facebook.com/blog/rss/                                                               | 每日       | 如无效则改抓页面解析 |
| 10   | Anthropic          | Atom | https://www.anthropic.com/news.atom                                                             | 每日       |                      |
| 11   | Hugging Face Blog  | RSS  | https://huggingface.co/blog/feed.xml                                                            | 每日       |                      |
| 12   | Stability AI       | RSS  | https://stability.ai/blog/rss.xml                                                               | 每日       |                      |
| 13   | AWS ML Blog        | RSS  | https://aws.amazon.com/blogs/machine-learning/feed/                                             | 每日       |                      |
| 14   | Azure AI Blog      | RSS  | https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/custom-blog-rss?board=AzureAI | 每日       |                      |
| 15   | InfoQ AI           | RSS  | https://feed.infoq.com/ai-ml-data-eng                                                           | 每日       | 技术媒体             |
| 16   | VentureBeat AI     | RSS  | https://venturebeat.com/category/ai/feed/                                                       | 每日       |                      |
| 17   | TechCrunch AI      | RSS  | https://techcrunch.com/category/artificial-intelligence/feed/                                   | 每日       |                      |
| 18   | The Gradient       | RSS  | https://thegradient.pub/rss/                                                                    | 每日       | 论文解读             |
| 19   | dev.to AI          | RSS  | https://dev.to/feed/tag/ai                                                                      | 每日       | 开发者社区           |
| 20   | HN(关键词)         | RSS  | https://hnrss.org/newest?q=ai%20programming                                                     | 每小时     | 结合关键词过滤       |

注：对不提供 RSS 的，优先使用 JSON API，否则静态解析；若站点阻止抓取或 RSS 暂不可用，替换等价源（如 Papers with Code、Meta AI 主页解析等）。

#### 页面与布局建议（统一头尾、响应式）

| 页面                   | 主要区块                                                                                  | 交互                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 首页 `/`               | 顶部导航；筛选条（关键词/来源/时间）；新闻卡片列表（标题/摘要/来源/时间/收藏/点赞）；分页 | 搜索、筛选、分页、点赞/收藏                            |
| 论坛/问答 `/community` | 标签切换：论坛/问答；发帖/提问按钮；列表（标题/作者/时间/互动数）；右侧热门标签           | 发表、浏览、点赞、收藏、评论、举报                     |
| 投稿 `/submit`         | 标题/正文/上传（图/视频）；发布须知与敏感词提示                                           | 提交时校验、上传到 Storage、写入 `posts`/`attachments` |
| 消息 `/messages`       | 私信列表、会话窗口；系统通知列表                                                          | 发送、已读、分页                                       |
| 反馈 `/feedback`       | 主题、正文、附件上传（≤10MB，类型白名单），提交成功提示                                   | 上传到 Storage 并写入 `feedback`/`attachments`         |
| 登录注册 `/auth`       | 登录/注册切换；邮箱+密码；登录后跳转首页                                                  | Supabase Auth                                          |
| 个人中心 `/profile`    | 基本资料、头像；积分总额、等级、积分流水、浏览量；我发布/收藏列表                         | 读取 Supabase 数据、分页                               |
| 法务与介绍             | 关于我们、隐私、服务协议、网站介绍                                                        | 静态页面                                               |

#### 交互流程（示例）

1. 用户登录 → Supabase Auth 成功 → 读取 `profiles` 初始化档案 → 触发登录积分流水

2. 发布帖子 → 校验敏感词/长度 → 上传附件（可选）→ 创建 `posts` → 创建 `attachments` → 增加积分流水 → 通知订阅者（系统通知）

3. 抓取任务 → 定时触发 `crawler.js` → 拉取多源 → 标准化 → `upsert news_items`（按 `url`）→ 写入统计字段（来源、时间）

#### 表单与校验规则

- 敏感词：基于维护的词库（数组）进行 `includes`/正则匹配；命中则拒绝并提示。
- 上传限制：前端与函数双重校验 `size<=10MB && mime in whitelist`。
- 评论：最小长度限制（≥3 字），不可编辑/删除。

#### 样式与可用性

- 简洁明快：浅色系、充足留白；移动端适配基础栅格。
- 组件化：列表卡片、分页器、筛选条、对话框复用。
