# AI 编程新闻网站（基于 Astro + Supabase + Netlify）

[Live Demo](https://astro-platform-starter.netlify.app/)

面向中文 PC 端的高端商业网站：聚合“AI 相关的编程”资讯与社区互动，包含新闻聚合、论坛/问答、用户系统（登录/注册/积分/等级）、用户反馈（附件上传限制 ≤10MB）、站内消息、统计视图、关于/隐私/服务协议/网站介绍等页面。数据服务与鉴权基于 Supabase，抓取与 AI 代理基于 Netlify Functions。遵循 5S 与 6A 规范，绝不使用模拟/降级数据。

## 环境变量（Netlify/Supabase）

在 Netlify 项目环境变量中配置（前端仅 `PUBLIC_` 前缀可见）：

| 变量                             | 用途                                                   |
| -------------------------------- | ------------------------------------------------------ |
| PUBLIC_SUPABASE_URL              | Supabase 项目 URL（前端可见）                          |
| PUBLIC_SUPABASE_ANON_KEY         | Supabase 匿名 Key（前端可见）                          |
| SUPABASE_SERVICE_ROLE_KEY        | Supabase 服务角色 Key（仅函数使用）                    |
| SUPABASE_DB                      | Supabase REST 基础 URL（通常等于 PUBLIC_SUPABASE_URL） |
| AI_PROVIDER                      | 默认 AI 提供商（如 deepseek）                          |
| DEEPSEEK_API_KEY/GLM_API_KEY/... | 各 AI 提供商密钥（函数使用）                           |

参考 `.env.example`。

## 任务与进度（摘要）

- ALIGNMENT/CONSENSUS/DESIGN/TASK 文档已提交于仓库根目录。
- 后续按 TASK 文档推进：页面/交互/函数/抓取/积分等级/校验等模块。

## 本地命令（如需）

所有命令均在项目根目录执行（仅测试/部署阶段使用终端）：

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 部署到 Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/astro-platform-starter)

## 本地开发（可选）

| Prerequisites                                                                |
| :--------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) v18.14+.                                      |
| (optional) [nvm](https://github.com/nvm-sh/nvm) for Node version management. |

1. Clone this repository, then run `npm install` in its root directory.

1. For the starter to have full functionality locally (e.g. edge functions, blob store), please ensure you have an up-to-date version of Netlify CLI. Run:

```bash
npm install netlify-cli@latest -g
```

1. Link your local repository to the deployed Netlify site. This will ensure you're using the same runtime version for both local development and your deployed site.

```bash
netlify link
```

1. 通过 Netlify CLI 运行 Astro.js 开发服务（或直接运行 `npm run dev`）:

```bash
netlify dev
```

若未自动打开，请访问 [localhost:8888](http://localhost:8888)。

## 故障修复与运维提示（crawler/新闻采集）

- 根因定位：`news_items` 行数为 0，`/.netlify/functions/crawler` 返回 `{inserted:0}`。原因是部分 RSS 源解析/可达性问题导致未产生可插入的数据。
- 修复内容：
  - 增强 `netlify/crawler.js`：环境变量校验、并发抓取、请求超时/UA/Accept 头、`content:encoded` 解析、批量 upsert 错误统计、写入 `crawler_logs` 表便于排障。
  - 首页 `index.astro` 在无数据时给出告警提示，并在 6 小时冷却内最多自动触发一次抓取，真实写库（无伪造/降级）。
- Netlify 定时：`netlify.toml` 已配置 `[[scheduled.functions]] name="crawler" schedule="0 2 * * *"`（UTC 02:00）。需要在 Netlify 后台确保 Scheduled Functions 已启用，且站点环境变量存在：`PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。
- 安全建议：为 `public.news_items` 启用 RLS（匿名只读、写入仅服务角色）。示例 SQL：
  - `alter table public.news_items enable row level security;`
  - `create policy "news_items_select_all" on public.news_items for select using (true);`
  - 服务写入侧通过 Netlify Function 使用 `SUPABASE_SERVICE_ROLE_KEY` 执行。

## 数据库初始化

在 Supabase SQL Editor 执行 `SCHEMA_supabase.sql` 中的建表与 RLS 策略。需创建 Storage Bucket：`public-uploads`、`private-uploads`。

## 验收标准（节选）

- 每日抓取 ≥100 条去重资讯入库；首页可搜索/筛选/分页；互动/上传/站内信/积分等级均可用；AI 问答真实调用（失败提示）。

## 测试进度（自动化）

- 测试工具：Node 脚本（`tests.node.mjs` / `tests.run.mjs`），不依赖 npm 测试框架。
- 本地构建检测：dist 目录及主要页面均存在（通过）。
- Supabase 连接：匿名连接成功（通过）。
- 核心表存在性：除 `comments` 表策略外全部通过；已修复 `comments` RLS（读全开、仅本人插入、禁改删），请确保在 Supabase 执行 `SQL_fix_policies_comments.sql`（已执行则此项通过）。
- 远程端到端：站点已上线 `https://ainewsblog5s6a.netlify.app`；首页可访问（通过）。`crawler` 与 `aiProxy` 接口按设计返回（需在线触发检查，脚本支持设置 `DEPLOY_URL` 后自动校验）。
- 报告输出：`test-report.json`（包含通过/失败/警告/跳过统计）。

> 注：近 24 小时抓取量阈值（≥100）为警告项，依赖定时任务与数据源可用性，首次部署可能需等待积累。
