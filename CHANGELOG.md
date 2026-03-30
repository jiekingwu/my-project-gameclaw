# Changelog

所有版本的主要变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [2.5.0] - 2026-03-28

### Added
- **LLM Function Calling** — 替代关键词匹配，AI 自主决定调用哪个功能
- **Soul 灵魂系统** — 预设人格、性格、说话方式（IDENTITY / SOUL / PLAYER / AGENTS / TOOLS）
- **16 个 Tool 定义** — set_reminder / list_reminders / delete_reminder / check_expiring_weapons / make_weapon_usage_plan / set_weapon_reminder / get_weekly_report / record_match / compare_peers / get_rank_plan / analyze_diamond_plan / get_daily_tasks / complete_task / query_weapon_wiki / get_player_profile / query_weather
- **天气 Skill** — 对接 wttr.in，支持中英文城市名，附带穿搭/游戏建议
- **技能开关** — 用户可自行启用/禁用各 Skill
- **日历同步** — 设置提醒后引导用户同步系统日历（wx.addPhoneCalendar）
- **提醒确认卡片组件** — reminder-confirm 组件替代纯文字确认
- **游戏角色功能** — GET/POST /gateway/game-role，profile 页弹窗编辑
- **needTools 精准匹配** — 简单对话不带 Tools（~2s），功能请求才带（~7s）
- **时间工具** — server/utils/time.js（统一北京时间处理）

### Changed
- 对话链路升级为 LLM + Function Calling（最多 3 轮 Tool 循环）
- 超时保护：LLM 带 Tools 20s / 不带 12s，Tool 执行 10s，前端 fetch 30s
- cron-scanner 扫描频率调整为每 10 秒

## [2.1.0] - 2026-03-27

### Added
- **信号检测** — 自动识别用户消息中的段位/KD/钻石/城市等信息，静默写入画像
- **战绩录入 API** — POST /gateway/match-record 快速录入对局数据
- **alerts 接口** — GET /gateway/alerts 获取智能提醒
- **Markdown 渲染** — 前端 md-parser 支持 AI 回复富文本展示
- **alert-card 动态化** — 提醒卡片支持多类型内容
- **订阅消息推送** — subscribe-msg 服务 + pending_messages 表
- **cron 定时扫描器** — 自动扫描武器到期 + 提醒触发

### Changed
- 前端去 tabBar 改为 custom 导航栏
- 后端版本升至 2.1.0

## [2.0.0] - 2026-03-27

### Added
- **5 大技能模块** — weapon-manager / battle-analyzer / diamond-advisor / daily-task / weather
- **三层记忆系统** — L1 即时记忆（会话）/ L2 短期记忆（日志）/ L3 长期记忆（画像）
- **用户画像系统** — 20+ 字段，支持自动提取和手动更新
- **数据库架构** — SQLite 11 张表（users / user_profiles / weapons / match_records / chat_sessions / daily_logs / memory_changelog / reminders / daily_tasks / pending_messages / skill_settings）

### Changed
- 架构从简单的关键词匹配升级为 Skill 模块化体系
- 前端引入自定义组件体系（chat-bubble / welcome-card / suggestion-chips / alert-card）

## [1.0.0] - 2026-03-26

### Added
- 项目初始化：微信小程序 + Node.js Express 后端
- 基础对话功能：关键词匹配 + 静态回复
- 用户鉴权：dev-login / wx-login + JWT
- 基础数据库：users 表 + user_profiles 表
- Docker 部署配置（微信云托管）
