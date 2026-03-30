# ZhijiClaw Server — Phase 2.5

> 🐱🔫 "主人的枪，我来守护。"

CF手游AI助理后端服务。一只从娃娃机里被薅出来的赛博小猫。

## 技术栈

- **运行时**: Node.js 18+
- **框架**: Express 4
- **数据库**: SQLite（better-sqlite3，WAL模式）
- **AI**: DeepSeek（OpenAI 兼容接口，Function Calling）
- **时区**: 北京时间（Asia/Shanghai）

## 架构

```
用户消息
  │
  ▼
Gateway（神经中枢）─→ Soul Loader（灵魂 + 玩家档案）
  │
  ├→ LLM + Function Calling（最多3轮）
  │    └→ Tool Executor → 5个 Skill 模块
  │
  ├→ Memory Manager（L1会话 + L2日志 + L3画像）
  ├→ Signal Detector（记忆信号自动写入画像）
  └→ Cron Scanner（定时扫描武器到期 + 提醒触发）
```

## 核心文件

### 🐱 灵魂系统（soul/）

| 文件 | 作用 |
|------|------|
| `IDENTITY.md` | 身份卡片（名字、物种、版本） |
| `SOUL.md` | 灵魂（性格、说话方式、价值观、边界） |
| `PLAYER.md` | 玩家档案模板（运行时动态填充） |
| `AGENTS.md` | 架构角色说明（谁干什么） |
| `TOOLS.md` | 全部技能/工具清单（16个Tool） |
| `loader.js` | 灵魂加载器（缓存 + 动态拼接 system prompt） |

### 🧠 Agent 层（agent/）

| 文件 | 作用 |
|------|------|
| `llm-client.js` | LLM 调用客户端（DeepSeek） |
| `tools-def.js` | 16个 Tool 的 JSON Schema 定义 |
| `tool-executor.js` | Tool 实际执行器（路由到 Skill） |

### 🎯 技能模块（skills/）

| Skill | 能力 |
|-------|------|
| `weapon-manager` | 武器到期检测、使用计划、守护提醒 |
| `battle-analyzer` | 周报、KD分析、段位规划、同段对比 |
| `diamond-advisor` | 省钻方案、充值建议、预算规划 |
| `daily-task` | 任务清单、完成标记、执行向导 |
| `weather` | 实时天气、3天预报、穿搭/游戏建议 |

### 🧠 记忆系统（memory/）

| 层级 | 存储 | 说明 |
|------|------|------|
| L1 即时 | chat_sessions | 会话消息，30分钟超时 |
| L2 短期 | daily_logs | 每日对话日志 |
| L3 长期 | user_profiles | 玩家画像（20+字段） |
| 审计 | memory_changelog | 记忆变更追溯 |

## 快速开始

```bash
cd server
npm install
npm run migrate
npm run dev
```

```bash
# 健康检查
curl http://localhost:3900/health

# 开发登录
curl -X POST http://localhost:3900/api/auth/dev-login

# 对话
curl -X POST http://localhost:3900/api/gateway/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"message": "帮我看看到期武器"}'
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/dev-login | 开发登录 |
| POST | /api/gateway/chat | 统一对话入口 |
| GET | /api/gateway/profile | 获取用户画像 |
| GET | /api/gateway/alerts | 获取智能提醒 |
| POST | /api/gateway/match-record | 快速录入战绩 |
| GET | /api/gateway/pending-messages | 轮询未消费消息 |
| GET | /api/gateway/skill-settings | 获取技能开关 |
| POST | /api/gateway/skill-settings | 设置技能开关 |
| GET | /api/gateway/game-role | 获取游戏角色 |
| POST | /api/gateway/game-role | 保存游戏角色 |

## 数据库

11张表，详见 `data/migrations/init.js`

## 版本

- **2.5.0** — Function Calling + Soul 灵魂系统 + 天气 Skill + 技能开关
