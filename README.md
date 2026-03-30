# ZhijiClaw — CF手游AI助理 🐱🔫

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org/)
[![WeChat Mini Program](https://img.shields.io/badge/WeChat-Mini%20Program-07C160?logo=wechat)](https://developers.weixin.qq.com/miniprogram/dev/framework/)

> "主人的枪，我来守护。"

**ZhijiClaw（指尖利爪）** 是一个运行在微信小程序上的 CF手游AI助理。用户打开小程序，就像和一个懂游戏的朋友聊天——它能帮玩家追踪武器到期、分析省钱方案、规划段位晋升、查天气，甚至记住玩家的习惯和偏好。

## ✨ 核心能力

| 模块 | 说明 |
|------|------|
| 🧠 智能对话 | 自然语言交互，LLM Function Calling 自动路由到对应技能 |
| 🔫 武器管理 | 限时武器到期追踪、使用排期、主动提醒 |
| 💎 钻石管家 | 充值性价比分析、省钻方案、预算规划 |
| 📊 战绩分析 | KD/胜率周报、同段位对比、段位晋升路线 |
| ✅ 每日任务 | 任务清单生成、完成打卡 |
| 🌤️ 生活助手 | 天气查询、穿搭建议、游戏建议 |

## 🏗 技术栈

| 端 | 技术 |
|---|------|
| **前端** | 微信小程序原生（WXML / WXSS / JS） |
| **后端** | Node.js 18 + Express 4 |
| **数据库** | SQLite（better-sqlite3，WAL 模式） |
| **AI** | DeepSeek LLM + Function Calling（16 个 Tool） |
| **部署** | 微信云托管（Docker 容器） |

### 架构亮点

- **Soul 灵魂系统** — AI 人格、身份、工具清单分离管理，人格可配置
- **Function Calling** — LLM 自动决策调用哪个技能，最多 3 轮 Tool 循环
- **三层记忆系统** — 短期对话 + 用户画像 + 持久存储
- **智能信号检测** — 对话中自动识别并写入玩家画像（段位、KD、偏好武器等）
- **定时扫描器** — 每 10 秒扫描武器到期 + 提醒推送
- **needTools 精准匹配** — 简单对话不带 Tools（~2s），功能请求才带（~7s）

## 📁 项目结构

```
zhijiclaw/
├── miniprogram/              # 微信小程序前端
│   ├── agent/                #   前端 Agent（chat-agent）
│   ├── assets/               #   静态资源
│   ├── components/           #   自定义组件（5个）
│   ├── pages/                #   页面（chat / skills / profile）
│   └── utils/                #   工具库（请求/对话引擎/MD解析）
│
├── server/                   # Node.js 后端服务
│   ├── agent/                #   AI Agent 层（LLM + Tools）
│   ├── config/               #   配置
│   ├── data/                 #   数据层（SQLite + 迁移脚本）
│   ├── memory/               #   三层记忆系统
│   ├── middleware/            #   中间件（鉴权 / 错误处理）
│   ├── routes/               #   路由（auth / gateway）
│   ├── services/             #   服务（cron扫描 / 订阅消息 / 微信鉴权）
│   ├── skills/               #   5个技能模块
│   ├── soul/                 #   灵魂系统（人格 / 身份 / 工具清单）
│   └── utils/                #   工具函数
│
├── docs/                     # 设计文档 & KM 文章
├── CHANGELOG.md              # 版本变更记录
└── LICENSE                   # MIT 开源协议
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- 一个 [DeepSeek API Key](https://platform.deepseek.com/)（免费额度即可体验）

### 1. 启动后端

```bash
cd server
cp .env.example .env          # 复制环境变量模板
# 编辑 .env，填入你的 DeepSeek API Key
npm install
npm run migrate               # 初始化数据库（11张表）
npm run dev                   # 启动开发服务 → http://localhost:3900
```

验证服务是否正常：

```bash
curl http://localhost:3900/health
# 预期返回: {"status":"ok","version":"2.5.0",...}

# 开发登录（获取 Token）
curl -X POST http://localhost:3900/api/auth/dev-login
```

### 2. 启动前端

1. 打开微信开发者工具
2. 导入项目，选择根目录（包含 `project.config.json` 的目录）
3. AppID 填写你自己的小程序 AppID（或使用[微信测试号](https://developers.weixin.qq.com/miniprogram/dev/devtools/sandbox.html)）
4. 确认 `miniprogram/utils/request.js` 中 `MODE = 'dev'`
5. 编译运行 🎉

> 📖 详细说明请分别查看 [server/README.md](./server/README.md) 和 [miniprogram/README.md](./miniprogram/README.md)

### 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `LLM_API_KEY` | ✅ | DeepSeek API Key |
| `DEEPSEEK_API_KEY` | ❌ | LLM_API_KEY 的别名（二选一） |
| `WX_APPID` | 生产环境 | 微信小程序 AppID |
| `WX_SECRET` | 生产环境 | 微信小程序 Secret |
| `JWT_SECRET` | ✅ | JWT 签名密钥（自定义一个随机字符串） |

## ☁️ 部署

项目使用 **微信云托管** 部署，基于 Docker 容器：

```bash
cd server
docker build -t zhijiclaw-server .
```

**关键配置：**
- 云托管端口：`80`
- 环境变量需在云托管控制台配置（`.env` 被 `.dockerignore` 排除）
- 前端需使用 `wx.cloud.callContainer` 方式调用（`MODE = 'cloud'`）

> ⚠️ `.tcloudbase.com` 域名不允许配为微信 request 合法域名，必须走 `callContainer` 内网通道

## 📡 API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/dev-login` | 开发登录 |
| POST | `/api/auth/wx-login` | 微信登录 |
| POST | `/api/gateway/chat` | 统一对话入口（LLM + Function Calling） |
| GET | `/api/gateway/profile` | 获取用户画像 |
| GET | `/api/gateway/alerts` | 获取智能提醒 |
| POST | `/api/gateway/match-record` | 快速录入战绩 |
| GET | `/api/gateway/pending-messages` | 轮询未消费消息 |
| GET/POST | `/api/gateway/skill-settings` | 技能开关管理 |
| GET/POST | `/api/gateway/game-role` | 游戏角色管理 |

> 完整接口文档见 [server/README.md](./server/README.md)

## 🤝 Contributing

欢迎 PR 和 Issue！无论是 Bug 修复、新功能还是文档改进。

1. Fork 本仓库
2. 创建你的分支 (`git checkout -b feature/awesome-feature`)
3. 提交改动 (`git commit -m 'feat: add awesome feature'`)
4. 推送分支 (`git push origin feature/awesome-feature`)
5. 发起 Pull Request

## 📄 版本

当前版本：**2.5.0**（Phase 2.5 — Function Calling + Soul 灵魂系统）

详细变更历史见 [CHANGELOG.md](./CHANGELOG.md)

## 📜 协议

[MIT License](./LICENSE) © 2026 jieking

---

如果这个项目对你有帮助，欢迎给个 ⭐ Star！
