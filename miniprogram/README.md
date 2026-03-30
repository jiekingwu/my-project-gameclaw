# ZhijiClaw 小程序前端

> 微信小程序原生开发，WXML + WXSS + JavaScript

## 目录结构

```
miniprogram/
├── app.js                    # 小程序入口（全局数据、登录逻辑）
├── app.json                  # 全局配置（页面路由、窗口样式）
├── app.wxss                  # 全局样式
├── sitemap.json              # 搜索引擎配置
│
├── agent/                    # 前端 Agent
│   └── chat-agent.js         #   封装后端 API 调用（chat/profile/alerts/gameRole 等）
│
├── assets/
│   └── icons/                # 图标资源
│
├── components/               # 自定义组件
│   ├── alert-card/           #   智能提醒卡片（武器到期/定时提醒）
│   ├── chat-bubble/          #   聊天气泡（用户/AI消息，支持 Markdown 渲染）
│   ├── reminder-confirm/     #   提醒确认卡片（同步系统日历引导）
│   ├── suggestion-chips/     #   快捷建议按钮（动态 chips）
│   └── welcome-card/         #   欢迎卡片（首屏引导 + 技能入口）
│
├── pages/                    # 页面
│   ├── chat/                 #   聊天页（核心交互页面）
│   ├── skills/               #   技能管理页（技能开关配置）
│   └── profile/              #   个人中心（画像信息、游戏角色编辑）
│
└── utils/                    # 工具库
    ├── request.js            #   网络请求封装（dev/prod 自动切换）
    ├── dialog-engine.js      #   对话引擎（消息管理、会话状态）
    └── md-parser.js          #   Markdown 解析器（AI回复富文本渲染）
```

## 页面说明

### 聊天页（chat）

核心交互页面，用户与 AI 助理对话的主入口。

- 支持文本输入发送
- AI 回复支持 Markdown 渲染（加粗、列表、代码块等）
- 快捷建议 chips（动态生成，点击即发送）
- 智能提醒卡片展示（来自后端 pending-messages 轮询）
- 提醒确认卡片（引导同步系统日历）
- 首屏显示欢迎卡片

### 技能管理页（skills）

展示所有 AI 技能模块，支持开关控制。

- 5 个技能：武器管理 / 战绩分析 / 钻石管家 / 每日任务 / 天气助手
- 开关状态与后端同步（GET/POST skill-settings）

### 个人中心（profile）

展示用户信息和游戏角色。

- 用户基本信息（头像、昵称）
- 游戏角色编辑（弹窗表单）
- 菜单导航

## 组件说明

| 组件 | 用途 | 触发条件 |
|------|------|----------|
| `chat-bubble` | 渲染用户/AI消息气泡 | 每条消息 |
| `welcome-card` | 首屏欢迎 + 技能快捷入口 | 无历史消息时显示 |
| `suggestion-chips` | 快捷操作按钮 | AI 回复附带 chips 时 |
| `alert-card` | 智能提醒（武器到期等） | pending-messages 轮询到新消息 |
| `reminder-confirm` | 日历同步确认卡片 | AI 回复包含 calendarEvent 时 |

## 网络请求

`utils/request.js` 封装了两种模式：

- **dev 模式**：使用 `wx.request` 直连本地后端 `http://localhost:3900`
- **prod 模式**：使用 `wx.request` 请求云托管公网域名

通过文件顶部 `mode` 常量切换。

## 本地开发

1. 确保后端已启动（`cd server && npm run dev`）
2. 打开 **微信开发者工具**
3. 导入项目，选择 `miniprogram/` 目录
4. AppID：填写你自己的小程序 AppID（或使用测试号）
5. 确认 `utils/request.js` 中 `mode = 'dev'`
6. 编译运行

### 注意事项

- 开发环境使用 `dev-login`，自动获取测试 Token
- 体验版/正式版使用 `wx-login`，需要真实微信授权
- `app.js` 中的登录逻辑会根据 `__wxConfig.envVersion` 自动区分环境
- 小程序不支持原生 SSE，提醒通知通过 10 秒轮询 `/api/gateway/pending-messages` 实现

## 设计风格

- 整体风格：微信 / 元宝浅色风
- 主色调：`#3D7EFF`
- 背景色：`#EDEDED`
- 用户气泡：`#95EC69`（微信绿）
- AI 气泡：`#FFFFFF`
- 头像：圆角方形，极轻阴影
