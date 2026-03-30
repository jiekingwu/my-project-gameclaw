# ZhijiClaw 运行流程与记忆系统

> 完整描述从服务启动到一次对话结束的全过程，以及记忆在何时被读取、何时被写入。

---

## 一、服务启动

```
app.js 启动
  │
  ├─ 1. 设定全局时区 process.env.TZ = 'Asia/Shanghai'
  ├─ 2. 注册全局异常捕获（防崩溃）
  ├─ 3. Express 初始化 + 中间件挂载
  ├─ 4. 验证 SQLite 连接（SELECT 1）
  ├─ 5. WAL checkpoint 清理 + 每5分钟定时清理
  ├─ 6. 启动 cronScanner（每10秒后台扫描）    ← 独立于用户请求
  ├─ 7. loadSoul() → 读取 SOUL.md 到内存缓存   ← 只读一次磁盘
  └─ 8. 监听端口（本地3900 / 云托管80）
```

启动完成后，系统有两条并行的生命线：
- **请求处理线**：等待用户发消息 → 处理 → 响应
- **后台扫描线**：每10秒自动检查武器到期和提醒到期

---

## 二、一次对话的完整生命周期

用户在小程序发一条消息，从进入系统到收到回复，完整经过以下步骤：

```
用户: "今天天气怎么样"
  │
  ▼
╔═══════════════════════ 同步阻塞（用户在等） ═══════════════════════╗
║                                                                    ║
║  ① 鉴权                                                           ║
║     JWT 解析 → 查 users 表 → 得到 req.user（id, openid, nickname） ║
║                                                                    ║
║  ② 加载三层记忆                                        【记忆读①】║
║     loadContext(userId) — 三层并发查询:                              ║
║     ┌─ L3: SELECT * FROM user_profiles    → 画像全字段             ║
║     ├─ L1: SELECT * FROM chat_sessions    → 30分钟内的对话         ║
║     └─ L2: SELECT * FROM daily_logs       → 最近2天的日志          ║
║                                                                    ║
║  ③ 构建灵魂 + 玩家档案                                 【记忆读②】║
║     buildSystemPrompt(userId, profile):                             ║
║     ┌─ SOUL.md 精华提取（内存缓存，不读磁盘）                      ║
║     └─ buildPlayerCard（5次DB查询）:                                ║
║        ├─ users 表 → 昵称、注册时间、陪伴天数                       ║
║        ├─ weapons_inventory → 武器仓库统计                         ║
║        ├─ daily_tasks → 今日任务进度                               ║
║        ├─ reminders → 待触发提醒数                                 ║
║        └─ profile.meta 解析 → selfName/city/playerNotes/画像       ║
║                                                                    ║
║  ④ 组装 LLM 消息                                                  ║
║     [system: 灵魂+档案] + [最近3轮对话] + [当前用户消息]            ║
║                                                                    ║
║  ⑤ 正则门控                                                       ║
║     needTools 正则匹配 → 决定是否带 Function Calling                ║
║     "今天天气怎么样" 命中"天气" → 带 Tools                          ║
║                                                                    ║
║  ⑥ LLM + Function Calling 循环（最多3轮）                          ║
║     ┌─ 第1轮: LLM 看到画像中有"所在城市:广州"                      ║
║     │         → 决定调 query_weather，不传 city                     ║
║     │                                                              ║
║     ├─ 技能开关检查                                     【记忆读③】║
║     │  checkSkillEnabled → 读 meta.skillSettings                   ║
║     │                                                              ║
║     ├─ Tool 执行                                        【记忆读④】║
║     │  query_weather: args.city 为空                                ║
║     │  → 从 profile.meta.city 读取 "广州"（降级补默认值）           ║
║     │  → 调 Weather Skill → 查 wttr.in → 返回天气数据              ║
║     │                                                              ║
║     └─ 第2轮: LLM 拿到天气数据 → 组织自然语言回复                  ║
║              "主人~广州今天25°C 多云..."                             ║
║                                                                    ║
║  ⑦ 返回响应给用户                                                  ║
║     { reply, chips, calendarEvent, meta }                          ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
  │
  │  ← 用户已经收到回复了，下面全部异步
  ▼
╔═══════════════════════ 异步后台（用户无感知） ═════════════════════╗
║                                                                    ║
║  ⑧ 更新即时记忆 + 短期记忆                             【记忆写①】║
║     appendToSession() → L1: 追加 user + assistant 消息              ║
║                          保留最近40条（= 20轮对话）                  ║
║     appendDailyLog()  → L2: 写入对话摘要日志                       ║
║                                                                    ║
║  ⑨ 信号检测 → 画像更新                         【互斥二选一路径】  ║
║                                                                    ║
║     hasAnySignal(userText) — 正则快扫（<1ms）                       ║
║     │                                                              ║
║     ├─ 命中 → detectSignals → applySignals              【记忆写②】║
║     │    ├─ RANK_CHANGE → UPDATE user_profiles.current_rank        ║
║     │    ├─ KD_CHANGE → UPDATE user_profiles.latest_kd             ║
║     │    ├─ DIAMOND_CHANGE → UPDATE user_profiles.total_diamonds   ║
║     │    ├─ CALL_ME → UPDATE user_profiles.call_name               ║
║     │    ├─ NAME_SELF → updateMeta(selfName) + 修改SOUL.md+刷缓存 ║
║     │    ├─ PLAYER_NOTE → appendNote(meta.playerNotes[])           ║
║     │    └─ LOCATION → updateMeta(city)                            ║
║     │                                                              ║
║     └─ 未命中 → extractAndSave（LLM画像提取）           【记忆写③】║
║          ├─ 快速过滤（太短/功能性请求 → 跳过）                     ║
║          ├─ LLM 分析（~2s, 200 token）                             ║
║          │   提取: birthday/age/city/occupation/hobby/goal 等13类  ║
║          └─ mergeToProfile → UPDATE meta.profile                   ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## 三、记忆的读写节点总览

### 读取节点（什么时候读记忆）

| 时机 | 读什么 | 从哪读 | 阻塞响应? |
|------|--------|--------|-----------|
| 每次对话开始 | 三层记忆全量加载 | user_profiles + chat_sessions + daily_logs | 是 |
| 构建灵魂档案 | 用户全部数据 + 武器/任务/提醒统计 | 5张表 + meta JSON | 是 |
| Tool 执行时 | 画像中的默认值（如城市） | profile.meta | 是 |
| 检查技能开关 | skillSettings | profile.meta.skillSettings | 是 |
| 后台扫描推送 | 用户称呼 | user_profiles.call_name | 否（后台任务） |

### 写入节点（什么时候写记忆）

| 时机 | 写什么 | 写到哪 | 阻塞响应? |
|------|--------|--------|-----------|
| 对话结束后 | 用户消息 + AI回复 | L1: chat_sessions | 否 |
| 对话结束后 | 对话摘要 | L2: daily_logs | 否 |
| 信号检测命中 | 段位/KD/钻石/称呼/城市等 | L3: user_profiles | 否 |
| 信号检测命中（起名字） | 助理别名 | meta.selfName + SOUL.md 文件 | 否 |
| 信号检测命中（记笔记） | 玩家备注 | meta.playerNotes[] | 否 |
| LLM画像提取 | 生日/职业/爱好等 | meta.profile 子对象 | 否 |
| 后台扫描触发 | 提醒消息 | L1: chat_sessions + pending_messages | 否（后台） |

**关键设计**：所有记忆写入都不阻塞用户响应。用户看到的延迟只来自 LLM 调用本身。

---

## 四、记忆的三层架构

```
┌──────────────────────────────────────────────────────────────────┐
│  L1 即时记忆（chat_sessions）                                     │
│                                                                   │
│  内容: 当前对话的消息列表（JSON 数组）                              │
│  窗口: 30分钟无活动 → 自动开新会话                                 │
│  容量: 保留最近 40 条消息（约 20 轮对话）                           │
│  注入: 最近 6 条消息截断 200 字后注入 LLM 上下文                    │
│  写入: 每次对话后异步追加 user + assistant 消息                     │
│  读取: loadContext() 时并发查询                                    │
├──────────────────────────────────────────────────────────────────┤
│  L2 短期记忆（daily_logs）                                        │
│                                                                   │
│  内容: 每次对话的摘要（输入/意图/输出各一行）                       │
│  保留: 永久                                                       │
│  写入: 每次对话后异步 INSERT                                       │
│  读取: loadContext() 时取最近 2 天、最多 20 条                      │
│  用途: 审计追溯 + 未来可做"昨天聊了什么"                           │
├──────────────────────────────────────────────────────────────────┤
│  L3 长期记忆（user_profiles + meta JSON）                         │
│                                                                   │
│  结构化字段（直接列）:                                              │
│    current_rank, latest_kd, headshot_rate, win_rate, avg_kills,   │
│    total_games, main_weapon, sub_weapon, playstyle,               │
│    total_diamonds, spending_style, has_month_card, call_name       │
│                                                                   │
│  扩展字段（meta JSON）:                                            │
│    meta.selfName          → 助理别名（"小爪"）                     │
│    meta.city              → 用户所在城市（"广州"）                   │
│    meta.playerNotes[]     → 玩家备注（"每晚10点有空"）上限20条      │
│    meta.skillSettings     → 技能开关（weapon-guard: true）          │
│    meta.gameRole          → 游戏角色信息                           │
│    meta.profile           → LLM 自动提取的画像（子对象）:           │
│      ├─ birthday, age, gender, city                               │
│      ├─ play_time, fav_mode, fav_map, fav_weapon                 │
│      ├─ real_name, occupation, hobby, goal                        │
│      └─ _updated（最后更新时间戳）                                 │
│                                                                   │
│  写入方式:                                                         │
│    - 信号检测（正则）→ 直接 UPDATE 字段 或 updateMeta()             │
│    - LLM画像提取 → mergeToProfile() 写入 meta.profile              │
│    - 战绩分析 Skill → 自动回写 KD/胜率/爆头率                      │
│  读取方式:                                                         │
│    - loadContext() 全量读出                                        │
│    - buildPlayerCard() 解析 meta 拼装主人档案                      │
│    - Tool Executor 补默认值时读 meta.city                          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 五、画像采集的双通道策略

每次对话后，系统会尝试从用户消息中提取值得记住的信息。两条路径互斥执行：

```
用户消息: "我搬到北京了"
  │
  ▼
hasAnySignal() — 30+ 条正则快扫（<1ms）
  │
  ├─ 命中 LOCATION 信号: /搬到(.{2,8}?)了/
  │   │
  │   ▼
  │   applySignals()
  │   → updateMeta(userId, 'city', '北京')
  │   → UPDATE user_profiles SET meta='{..."city":"北京"...}'
  │   → 下次对话 buildPlayerCard 就能看到"所在城市: 北京"
  │   → 下次查天气自动查北京
  │
  │   总成本: <1ms, 0 token
  │
  └─ 如果没命中（比如"我是个大学生，晚上10点后才有空打游戏"）
      │
      ▼
      extractAndSave()
      ├─ 过滤: 不是功能性请求 → 继续
      ├─ LLM 分析: → {"occupation":"大学生","play_time":"晚上10点后"}
      └─ mergeToProfile()
         → meta.profile.occupation = "大学生"
         → meta.profile.play_time = "晚上10点后"
         → 下次 buildPlayerCard 展示"💼 职业: 大学生"

         总成本: ~2s, ~200 token
```

为什么互斥？正则能搞定的不浪费 LLM 调用。正则搞不定的（复杂的自然语言表述），才让 LLM 出手。

---

## 六、特殊流程：给 AI 改名字

这是记忆系统里最特殊的一条路径——它不仅改数据库，还改文件。

```
用户: "以后叫你小爪"
  │
  ▼ 信号检测命中 NAME_SELF
  │  正则: /以后叫你(?!什么|啥)([\w\u4e00-\u9fa5]{1,12}?)[吧呢啊哦嘛好]?$/
  │  捕获: "小爪"
  │
  ▼ 两处同步写入:
  │
  ├─ 1. updateMeta(userId, 'selfName', '小爪')
  │     → meta.selfName = "小爪"
  │     → 下次 buildPlayerCard: "主人给你起的名字: 小爪（优先用这个名字自称）"
  │
  └─ 2. updateSoulName('小爪')
        ├─ 读取 server/soul/SOUL.md
        ├─ 在"我是谁"段落追加:
        │  "主人给我起的小名：**小爪**（主人喜欢这样叫我，我也用这个名字自称）"
        ├─ 写回 SOUL.md
        └─ reloadSoul() → soulCache = null → 下次 loadSoul() 重读
  │
  ▼ 下次对话:
     buildSystemPrompt 读到的 SOUL.md 已包含新别名
     Player Card 也包含 "主人给你起的名字: 小爪"
     → LLM 自然地用"小爪"自称
```

---

## 七、后台扫描线（cron-scanner）

独立于用户请求，每10秒运行一次：

```
每10秒 scan()
  │
  ├─ scanExpiringWeapons()
  │   │
  │   ├─ SQL: 查找 24小时内到期且未通知的限时武器
  │   │       JOIN users 拿到 openid
  │   │
  │   ├─ 对每件到期武器:
  │   │   ├─ 读 user_profiles.call_name → 个性化称呼      【记忆读】
  │   │   ├─ sendReminder(openid, ...) → 微信订阅消息推送
  │   │   ├─ injectReminderMessage(userId, ...)            【记忆写】
  │   │   │   ├─ 追加到 chat_sessions.messages（L1 对话列表）
  │   │   │   └─ INSERT pending_messages（前端轮询拉取）
  │   │   └─ UPDATE notified = 1（标记已通知）
  │   │
  │   └─ 消息模板（带人格）:
  │      "⚠️ 大佬注意！M4A1-黑龙 还有 8 小时就到期了！
  │       赶紧用它打几局排位，别浪费了好枪 🔫"
  │
  └─ scanReminders()
      │
      ├─ SQL: 查找 status='pending' 且 remind_at <= 当前北京时间
      │       兼容两种时间格式（SQLite格式 / ISO 8601）
      │
      └─ 对每个到期提醒:
          ├─ sendReminder → 微信订阅消息
          ├─ injectReminderMessage → L1 + pending_messages  【记忆写】
          └─ UPDATE status = 'fired'
```

---

## 八、前端请求模式

```
小程序发请求
  │
  ├─ MODE = 'dev'    → wx.request → http://localhost:3900/api
  ├─ MODE = 'cloud'  → wx.cloud.callContainer → 微信内网通道（线上用这个）
  └─ MODE = 'prod'   → wx.request → tcloudbase.com（不可用，域名被限制）

登录分流:
  ├─ envVersion = 'develop'  → chatAgent.devLogin()  → /auth/dev-login
  └─ envVersion = 'trial'/'release' → chatAgent.wxLogin() → wx.login() + /auth/login
```

---

## 九、数据库表与记忆的对应关系

| 表名 | 记忆层级 | 用途 | 读取时机 | 写入时机 |
|------|---------|------|---------|---------|
| `users` | — | 用户基本信息 | 鉴权时、buildPlayerCard | 注册时 |
| `user_profiles` | L3 长期 | 用户画像 + meta JSON | loadContext、buildPlayerCard、Tool补默认值 | 信号检测、LLM画像提取、战绩Skill回写 |
| `chat_sessions` | L1 即时 | 对话消息列表 | loadContext | 每次对话后异步、cron注入提醒消息 |
| `daily_logs` | L2 短期 | 对话摘要 | loadContext | 每次对话后异步 |
| `memory_changelog` | 审计 | 记忆变更日志 | 暂未使用 | 暂未使用 |
| `weapons_inventory` | 业务数据 | 武器仓库 | buildPlayerCard统计、Skill查询 | 武器添加/到期标记 |
| `match_records` | 业务数据 | 对局记录 | 战绩Skill聚合分析 | record_match Tool |
| `reminders` | 业务数据 | 自定义提醒 | buildPlayerCard计数、cron扫描 | set_reminder Tool |
| `daily_tasks` | 业务数据 | 每日任务 | buildPlayerCard进度、Skill查询 | complete_task Tool |
| `pending_messages` | 推送 | 待消费消息 | 前端轮询 | cron注入 |
| `weapons_wiki` | 静态 | 枪械百科 | query_weapon_wiki Tool | 初始化种子数据 |

---

## 十、性能关键路径

一次对话中，用户等待时间 = 以下阶段之和：

```
鉴权 .............. ~1ms
loadContext ....... ~3ms  （SQLite 同步引擎，3次查询并发）
buildSystemPrompt . ~5ms  （5次DB查询 + meta解析）
needTools 正则 .... <1ms
LLM 调用 ......... 2~20s  ← 延迟的绝对主体
Tool 执行 ........ 0~10s  （视Skill而定，天气约2s）
─────────────────────────
总计 .............. 2~30s  （闲聊~2s，复杂功能~7s）

不计入等待时间的（异步）：
updateMemoryAsync .. ~5ms
applySignals ...... ~2ms
extractAndSave .... ~2s  （消耗额外 LLM 调用，但用户不等）
```
