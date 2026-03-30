# TOOLS.md — 技能与工具清单

> ZhijiClaw 的所有能力都在这里。
> 每个 Tool 通过 LLM Function Calling 自动触发，不需要用户记命令。

## 📊 能力总览

| 类别 | Skill 模块 | Tool 数量 | 技能ID（开关用） |
|------|-----------|----------|-----------------|
| ⏰ 提醒系统 | 内置（基础功能） | 3 | — 不可关闭 |
| 🔫 武器管理 | weapon-manager | 3 | weapon-guard |
| 📊 战绩分析 | battle-analyzer | 4 | battle-analyzer |
| 💎 钻石管家 | diamond-advisor | 1 | diamond-advisor |
| ✅ 每日任务 | daily-task | 2 | daily-task |
| 🔍 枪械百科 | 内置 | 1 | weapon-wiki |
| 👤 玩家画像 | 内置（基础功能） | 1 | — 不可关闭 |
| 🌤️ 天气助手 | weather | 1 | weather |
| **合计** | **5 个 Skill** | **16 个 Tool** | **6 个可开关** |

---

## ⏰ 提醒系统（基础功能，不可关闭）

### set_reminder
- **触发**: "10分钟后提醒我喝水"、"明天中午提醒我打排位"
- **参数**: content（提醒内容）、remind_at（ISO时间，LLM自动计算）
- **行为**: 写入 reminders 表 → cron 到期触发 → pending_messages 推送
- **日历同步**: 设置成功后返回 calendarEvent 数据，前端 chips 中会出现「📅 同步到手机日历」按钮
- **LLM引导**: 设置提醒成功后，主动询问用户是否同步到手机系统日历

### list_reminders
- **触发**: "查看所有提醒"、"我的提醒"
- **行为**: 查询 pending + fired 状态的提醒，标注 ⏳/✅

### delete_reminder
- **触发**: "删除提醒 #3"
- **参数**: reminder_id

---

## 🔫 武器管理（weapon-manager）

### check_expiring_weapons
- **触发**: "有武器快到期了吗"、"查看到期武器"
- **行为**: 查 weapons_inventory 表，按到期时间排序，标注紧急程度（🔴/🟡/🟢）

### make_weapon_usage_plan
- **触发**: "制定使用计划"
- **行为**: 根据到期时间和武器类型，生成最优使用排期

### set_weapon_reminder
- **触发**: "设置到期提醒"
- **行为**: 重置武器 notified 标记，cron 会在到期前24小时/2小时提醒

---

## 📊 战绩分析（battle-analyzer）

### get_weekly_report
- **触发**: "看看最近战绩"、"本周战绩报告"
- **行为**: 聚合最近7天 match_records → KD/胜率/爆头率/MVP + 趋势对比 + 提升建议
- **副作用**: 自动更新 user_profiles 的 KD/胜率/爆头率

### record_match
- **触发**: "录入战绩 8杀3死"
- **参数**: mode、map_name、result、kills、deaths、headshots

### compare_peers
- **触发**: "对比同段位玩家"
- **行为**: 用内置的段位 benchmark 数据对比，给出领先/落后百分比

### get_rank_plan
- **触发**: "帮我规划段位晋升"
- **行为**: 根据当前段位和数据，生成段位晋升路线

---

## 💎 钻石管家（diamond-advisor）

### analyze_diamond_plan
- **触发**: "帮我分析省钻方案"、"充值建议"
- **参数**: action（analyze/tips/budget）
- **行为**: 根据玩家钻石余额、月卡状态、消费风格生成个性化方案

---

## ✅ 每日任务（daily-task）

### get_daily_tasks
- **触发**: "今天还有什么任务"、"每日任务"
- **行为**: 自动初始化当天任务（6个默认任务）→ 显示完成进度

### complete_task
- **触发**: "签到完成了"、"标记完成排位任务"
- **参数**: task_name（关键词匹配）

---

## 🔍 枪械百科（内置）

### query_weapon_wiki
- **触发**: "AK47数据怎么样"、"查一下AWM"
- **参数**: weapon_name
- **行为**: 查 weapons_wiki 表（伤害/精准/射速/后坐力/评级/技巧）

---

## 👤 玩家画像（基础功能，不可关闭）

### get_player_profile
- **触发**: "我的数据怎么样"、"看看我的画像"
- **行为**: 加载 user_profiles + weapons_inventory 全量数据

---

## 🌤️ 天气助手（weather）

### query_weather
- **触发**: "今天天气怎么样"、"深圳天气"、"明天下雨吗"
- **参数**: city（可选，不传时从用户画像 meta.city 读取，兜底深圳）
- **数据源**: wttr.in（免费、无需注册）
- **输出**: 实时天气 + 3天预报 + 穿搭建议 + 游戏建议
- **城市优先级**: LLM传的city > 画像meta.city > 默认深圳

---

## 🔧 触发机制

### needTools 正则（gateway.js）

只有匹配以下关键词的消息才会带 Tools 调 LLM（避免简单对话走慢路径）：

```
提醒我|设.*提醒|查看.*提醒|所有提醒|我的提醒
到期.*武器|武器.*到期|查.*武器|武器库|武器.*快
战绩|录入.*对局|KD|kd
省钻|充值.*方案|钻石.*分析|分析.*钻石
每日任务|完成.*任务
段位.*规划|配枪|枪械.*数据
删除.*提醒
天气|气温|下雨|穿什么
```

不匹配的消息（如"你好"、"谢谢"）直走 LLM 纯聊天（~2秒），匹配的走 Function Calling（~7秒）。

### 技能开关

通过 `POST /api/gateway/skill-settings` 设置，存在 `user_profiles.meta.skillSettings`。
关闭的技能在 Tool 执行前被拦截，返回引导话术引导用户开启。
