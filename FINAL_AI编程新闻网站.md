### FINAL — 项目总结（AI 编程新闻网站）

| 项       | 内容                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| 技术栈   | Astro + 原生 JS/CSS + Supabase（Auth/DB/Storage/RLS）+ Netlify Functions（crawler/aiProxy）                                 |
| 主要功能 | 新闻聚合、论坛/问答（统一模型）、评论/点赞/收藏/举报、AI 问答、用户系统、积分等级、消息/通知、反馈与附件、法务页面          |
| 数据源   | 20 个主流 RSS/API（详见 DESIGN），每日去重入库 ≥100 条                                                                      |
| 安全     | 环境变量与密钥隔离；上传白名单与大小限制；敏感词过滤；不使用任何模拟/降级数据                                               |
| 文档     | ALIGNMENT/CONSENSUS/DESIGN/TASK/ACCEPTANCE/FINAL 全量齐备                                                                   |
| 部署     | `netlify.toml` 配置函数目录与定时任务；上线后设置 Netlify 环境变量与 Supabase RLS/存储                                      |
| 待办     | 在 Supabase 控制台启用各表 RLS；运行 `SCHEMA_supabase.sql`；配置 Storage Buckets；在 Netlify 配置各 AI 密钥与 Supabase keys |
