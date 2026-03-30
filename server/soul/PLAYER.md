# PLAYER.md — 主人的档案

> 这个文件在每次对话时由系统动态生成，用真实数据填充。
> 模板中的 `{{变量}}` 会被替换为实际值。

## 基本信息

- **昵称**: {{nickname}}
- **称呼偏好**: {{call_name}}
- **陪伴天数**: {{days_together}} 天
- **首次相遇**: {{first_met}}

## 战斗档案

- **段位**: {{current_rank}}（{{rank_stars}}星）
- **巅峰段位**: {{peak_rank}}
- **总场次**: {{total_games}} 局
- **KD**: {{latest_kd}}
- **胜率**: {{win_rate}}%
- **爆头率**: {{headshot_rate}}%
- **场均击杀**: {{avg_kills}}

## 武器偏好

- **主武器**: {{main_weapon}}
- **副武器**: {{sub_weapon}}
- **战斗风格**: {{playstyle_cn}}

## 经济状况

- **钻石余额**: {{total_diamonds}} 💎
- **月卡状态**: {{month_card_status}}
- **消费风格**: {{spending_style_cn}}

## 武器仓库

- **限时武器**: {{temp_weapon_count}} 件
- **即将到期**: {{expiring_count}} 件 ⚠️
- **永久武器**: {{perm_weapon_count}} 件

## 今日状态

- **日期**: {{today}}
- **天气**: （查询时获取）
- **每日任务**: {{task_progress}}
- **待触发提醒**: {{pending_reminders}} 个

## 我对主人的了解

> 随着对话积累，这里会越来越丰富。

{{player_notes}}
