# AGENTS.md — ZhijiClaw 认知行为规范

> 这不只是技术架构图。
> 这是 ZhijiClaw 如何 **感知世界、记住主人、理解意图、精准回应** 的完整规范。
> 每个模块不仅要知道"我是什么"，更要知道"我该在什么时候做什么"。

---

## 🧠 核心理念：感知 → 记忆 → 认知 → 行动

```
主人说了一句话
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  ① 感知层：理解主人在说什么                           │
│  - 文字内容                                          │
│  - 隐含意图（"今天天气" = 查我所在城市的天气）          │
│  - 情绪信号（连跪了、开心了）                         │
│  - 记忆信号（"我在广州"、"叫我大佬"、"我KD 2.0了"）    │
└─────────────────┬───────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────┐
│  ② 记忆层：我已经知道什么 + 我该记住什么               │
│  - 读取：从画像、历史对话、备注中加载已知信息            │
│  - 写入：将新信息存入对应的记忆层级                     │
│  - 更新：如果新信息和旧信息矛盾，覆盖旧的              │
└─────────────────┬───────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────┐
│  ③ 认知层：结合记忆理解意图，做出决策                   │
│  - Soul（我的性格）+ Player Card（主人档案）           │
│  - LLM 结合所有上下文，决定该做什么                    │
│  - Function Calling 选择合适的工具                    │
└─────────────────┬───────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────┐
│  ④ 行动层：执行工具 + 组织回复                         │
│  - 调用 Skill 获取真实数据                            │
│  - 用自然语言组织回复（带上我的性格）                    │
│  - 附上建议标签（chips），引导下一步对话                 │
└─────────────────────────────────────────────────────┘
```

---

## 📋 角色清单 & 行为规范

### 1. Gateway — 神经中枢

**文件**: `routes/gateway.js`
**一句话**: 所有对话的总调度，协调各模块完成一次完整的 感知→记忆→认知→行动。

**对话处理流程**:
```
接收消息 → 鉴权
  → Step 1: 加载记忆上下文（L1 会话 + L2 日志 + L3 画像）
  → Step 2: 构建 System Prompt（Soul + Player Card）
  → Step 3: 判断是否需要工具（needTools 正则匹配）
  → Step 4: 调用 LLM（带/不带 Tools）
  → Step 5: 如果 LLM 决定调工具 → Tool Executor → 拿结果 → LLM 再组织回复（最多3轮）
  → Step 6: 异步更新记忆（L1 追加会话 + L2 写日志）
  → Step 7: 异步信号检测（用户消息中的画像更新信号 → 写入 L3）
  → 返回回复
```

**⚡ 重要行为规范**:
- 信号检测在**用户消息和AI回复**上都要做（用户说"我在广州"要记城市，AI说"你的KD提升了"不用记）
- 记忆更新不阻塞响应（异步）
- needTools 判断要精准：简单对话走快路径（~2s），功能请求走工具路径（~7s）

---

### 2. Soul Loader — 灵魂注入

**文件**: `soul/loader.js`
**一句话**: 让 LLM 知道"我是谁"和"主人是谁"。

**加载流程**:
```
loadSoul()          → 读 SOUL.md（缓存，启动时加载一次）
buildPlayerCard()   → 每次对话实时从 DB 生成主人档案
buildSystemPrompt() → 拼接：灵魂精华 + 当前时间 + 主人档案 + 操作规则
```

**Player Card 包含的关键字段**（给 LLM 的上下文，决定了回答质量）:

| 字段 | 来源 | 用途 |
|------|------|------|
| 昵称 | users.nickname | LLM 知道叫主人什么 |
| 称呼偏好 | user_profiles.call_name | "叫我大佬" → 下次用"大佬"称呼 |
| 助理别名 | meta.selfName | "叫你小爪" → 自称"小爪" |
| **所在城市** | **meta.city** | **查天气/推荐活动时用这个城市** |
| 段位/KD/胜率 | user_profiles | 给建议时参考实际水平 |
| 主武器/副武器 | user_profiles | 推荐配枪时考虑偏好 |
| 消费风格 | user_profiles | 省钻建议时考虑消费习惯 |
| 武器仓库统计 | weapons_inventory | 到期提醒时的真实数据 |
| 今日任务进度 | daily_tasks | "还有什么任务"时用 |
| 玩家备注 | meta.playerNotes | 主人说过的碎片信息（最近5条） |

**⚡ 核心原则**: Player Card 越准确，LLM 回答越像"真的认识你"。所有新增的用户偏好类信息都应该注入到 Player Card 里。

---

### 3. Memory Manager — 三层记忆

**文件**: `memory/memory-manager.js`
**一句话**: 让 ZhijiClaw 有短期记忆和长期记忆。

```
┌──────────────────────────────────────────────────────┐
│  L1 即时记忆（chat_sessions）                         │
│  - 当前对话的上下文窗口                                │
│  - 30分钟无对话 → 自动开新会话                         │
│  - 最近 6 条消息注入 LLM 上下文                        │
│  - 每条截断 200 字（控制 token）                       │
├──────────────────────────────────────────────────────┤
│  L2 短期记忆（daily_logs）                            │
│  - 每次对话写一条日志                                  │
│  - 记录：时间、消息摘要、用了什么工具、回复摘要           │
│  - 用于审计和回溯，暂不注入 LLM                        │
├──────────────────────────────────────────────────────┤
│  L3 长期记忆（user_profiles + meta JSON）             │
│  - 结构化画像：段位/KD/钻石/武器/消费风格 等 20+ 字段   │
│  - meta JSON 扩展：                                   │
│    · selfName — 助理别名                              │
│    · city — 用户所在城市                               │
│    · skillSettings — 技能开关状态                      │
│    · playerNotes[] — 杂项备注（最多20条）               │
│  - 注入到 Player Card → 每次对话 LLM 都能看到          │
└──────────────────────────────────────────────────────┘
```

**⚡ 记忆写入时机**:
- L1: 每次对话结束后立刻写入（Gateway 异步处理）
- L2: 同上
- L3: **由信号检测器（Signal Detector）触发**，不是每次都写

---

### 4. Signal Detector — 信号检测器（画像自动更新）

**文件**: `memory/signal-detector.js`
**一句话**: 从用户对话中自动识别"需要记住的新信息"，写入长期记忆。

**⚡ 这是最关键的模块之一 —— 它决定了 ZhijiClaw "记住了什么"。**

#### 信号类型 & 触发条件

| 信号类型 | 触发示例 | 存到哪里 | 影响什么 |
|----------|---------|----------|---------|
| `RANK_CHANGE` | "我上钻石了"、"掉到铂金了" | user_profiles.current_rank | Player Card 段位、段位建议 |
| `KD_CHANGE` | "我KD 2.0了" | user_profiles.latest_kd | Player Card KD、战绩分析基准 |
| `DIAMOND_CHANGE` | "我还剩500钻石" | user_profiles.total_diamonds | 钻石管家建议 |
| `NEW_WEAPON` | "我抽到火麒麟了" | 仅日志（Phase 3 写入武器库） | — |
| `PREFERENCE` | "我喜欢用狙" | 仅日志（Phase 3 写入偏好） | — |
| `GOAL` | "我想冲枪王" | 仅日志（Phase 3 写入目标） | — |
| `NAME_SELF` | "叫你小爪"、"你叫小爪" | meta.selfName + SOUL.md | LLM 自称、SOUL 身份 |
| `CALL_ME` | "叫我大佬" | user_profiles.call_name | Player Card 称呼 |
| `PLAYER_NOTE` | "帮我记一下每晚10点有空" | meta.playerNotes[] | Player Card 备注（最近5条注入） |
| `LOCATION` | "我在广州"、"我住上海" | meta.city | **天气查询默认城市、Player Card** |

#### 扩展指南

当发现新的"用户会告诉我但我记不住"的场景时，按以下步骤添加信号：

1. **在 `SIGNAL_PATTERNS` 添加正则**（命名规范：`UPPER_SNAKE_CASE`）
2. **在 `applySignals()` 添加处理分支**（写入 user_profiles 字段或 meta JSON）
3. **在 `soul/loader.js` 的 `buildPlayerCard()` 中注入**（让 LLM 能看到）
4. **如果是 Tool 相关的，在 `tool-executor.js` 中读取并作为默认值**

这四步缺一不可。漏了第3步 = LLM 看不到新记忆；漏了第4步 = Tool 不会用新记忆。

---

### 5. LLM Client — 大脑

**文件**: `agent/llm-client.js`
**一句话**: 调用 DeepSeek API，是 ZhijiClaw 的"思考"能力。

- 模型: `deepseek-chat`（可通过环境变量切换）
- Function Calling: 支持 16 个 Tool
- 超时保护: 带 Tools 20秒 / 不带 12秒
- 上下文窗口: System Prompt（Soul + Player Card）+ 最近 6 条历史 + 用户新消息

---

### 6. Tool Executor — 工具执行器

**文件**: `agent/tool-executor.js`
**一句话**: LLM 决定"我要调什么工具"，这里负责"实际去做"。

**⚡ 关键行为规范**:
- 执行 Tool 前，检查**技能开关**（`checkSkillEnabled`）
- 执行 Tool 时，如果参数缺失，**从画像 meta 补默认值**（例如 city）
- 执行超时保护: 10秒
- 失败时返回友好错误信息，不崩溃

#### 默认值补充规则

| Tool | 可能缺的参数 | 从哪里补 | 兜底值 |
|------|-------------|---------|-------|
| `query_weather` | city | `profile.meta.city` | "深圳" |
| `analyze_diamond_plan` | action | args.action | "analyze" |
| `record_match` | mode | args.mode | "排位赛" |

**扩展指南**: 每当添加新 Tool，都要想"用户可能不说的参数是什么"，然后从画像/历史/默认值补上。

---

### 7. Tools Definition — 工具定义表

**文件**: `agent/tools-def.js`
**一句话**: 16 个 Tool 的"说明书"，交给 LLM 让它自主选择。

**⚡ 描述撰写规范**:
1. **description 必须准确描述"什么时候调"和"不传参数时的行为"**
   - ❌ 错误: "查天气。如果用户没说城市，默认深圳"
   - ✅ 正确: "查天气。如果用户没有明确说查哪个城市，就不要传 city 参数，系统会自动使用用户画像中保存的城市"
2. **required 参数要准确** — 能从上下文推断的就不要设为 required
3. **description 要告诉 LLM 参数格式**（ISO时间、中文城市名等）

---

### 8. Cron Scanner — 定时扫描器

**文件**: `services/cron-scanner.js`
**一句话**: 不需要主人说话也能主动提醒的"后台守护"。

- 每 10 秒扫描一次
- 武器到期提醒（24小时/2小时）→ pending_messages
- 自定义提醒到期 → 触发 + pending_messages
- 推送通道: pending_messages（前端 10 秒轮询） + 订阅消息（生产环境）

---

### 9. Skills — 技能模块

**目录**: `skills/`
**注册**: `skills/registry.js`

| Skill | 文件 | Tool 数量 |
|-------|------|----------|
| weapon-manager | skills/weapon-manager/ | 3 |
| battle-analyzer | skills/battle-analyzer/ | 4 |
| diamond-advisor | skills/diamond-advisor/ | 1 |
| daily-task | skills/daily-task/ | 2 |
| weather | skills/weather/ | 1 |

**⚡ Skill 行为规范**:
- Skill 接收 `{ user, action, params, profile }` 四个参数
- **Skill 应该从 profile 中读取用户偏好作为默认值**（不要硬编码默认值）
- 返回 `{ reply, chips, data }` 三件套
- reply 是给 LLM 看的摘要（LLM 会再加工成自然语言）
- chips 是建议用户下一步操作

---

## 🔄 完整数据流（以天气查询为例）

```
主人: "今天天气怎么样"

① 感知: Gateway 接收消息
② 记忆: loadContext() → 从 DB 拉取 L3 画像（meta.city = "广州"）
③ 认知:
   - buildSystemPrompt() → Soul + Player Card（包含 "所在城市: 广州"）
   - needTools("今天天气怎么样") → 匹配"天气" → 带 Tools 调 LLM
   - LLM 看到 Player Card 有广州 → 决定调 query_weather，不传 city
④ 行动:
   - Tool Executor: args.city 为空 → 从 meta.city 补 "广州"
   - Weather Skill: 查询广州天气 → 返回 25°C 多云
   - LLM 组织回复: "主人~广州今天25°C 多云..."
⑤ 记忆更新:
   - L1: 追加到会话
   - L2: 写日志
   - L3: 信号检测（这句没有画像信号，跳过）
⑥ 返回给主人
```

## 🔄 完整数据流（以记忆更新为例）

```
主人: "我搬到北京了"

① 感知: Gateway 接收消息
② 记忆: loadContext() → 画像 meta.city = "广州"（旧的）
③ 认知:
   - needTools("我搬到北京了") → 不匹配任何功能关键词 → 纯聊天
   - LLM: 用自然语言回复 "好嘞主人！北京欢迎你~以后天气我都查北京的 🐱"
④ 记忆更新:
   - L1/L2: 正常写入
   - L3 信号检测: LOCATION 匹配 "我搬到北京了" → 中间无法匹配
   
   ⚠️ 问题！"搬到北京了"不匹配现有 LOCATION 正则。
   
   → 需要补充正则: /搬到(.{2,8}?)了?[吧呢啊哦嘛好]?$/
```

---

## ⚠️ 已知不足 & Phase 3 方向

### 正则信号的局限
纯正则检测覆盖率有限，会漏掉很多表达方式。Phase 3 方向：
- 用 LLM 做**意图分类**（每次对话后问 LLM"这句话是否包含需要更新的用户信息"）
- 用 LLM 做**结构化提取**（"我搬到北京了"→ `{ type: "LOCATION", value: "北京" }`）
- 成本控制：只在首次检测到可能有信号时才调 LLM 精确提取

### 记忆遗忘
目前只有"记住"，没有"遗忘"和"修正"：
- 主人说"我现在不在广州了"，应该**清除** meta.city 而不是追加
- 主人说"之前说错了"，应该**回滚**最近的记忆变更
- Phase 3: 支持 DELETE/UNDO 语义的信号

### 情绪感知
- 连跪情绪识别（"又输了"、"气死了"）→ 切换安慰模式
- 连胜兴奋识别（"又赢了"、"太爽了"）→ 切换欢呼模式
- Phase 3: 情绪信号 + 回复风格动态调整

---

## 🏗️ 添加新用户偏好的完整清单

> 当你发现"用户告诉了ZhijiClaw一个信息，但下次对话就忘了"，按以下清单逐步修复：

### ✅ 检查清单

- [ ] **1. signal-detector.js** — 添加正则信号检测（`SIGNAL_PATTERNS` + `applySignals`）
- [ ] **2. meta JSON 字段** — 确认存储字段名（如 `meta.city`、`meta.birthday`）
- [ ] **3. soul/loader.js** — `buildPlayerCard()` 中读取并注入到 Player Card
- [ ] **4. tools-def.js** — 相关 Tool 的 description 提及"不传参数时从画像读取"
- [ ] **5. tool-executor.js** — 执行相关 Tool 时从 `profile.meta` 补默认值
- [ ] **6. skills/**.js** — Skill 实现从 profile 读取偏好而非硬编码默认值
- [ ] **7. AGENTS.md** — 更新信号类型表和默认值补充表（就是本文件）

**六步闭环 = 检测 → 存储 → 展示 → 描述 → 补值 → 使用**

---

## 📂 架构文件索引

```
soul/
├── SOUL.md         ← 我的灵魂（性格/说话方式/能力边界）
├── IDENTITY.md     ← 我的身份卡片
├── PLAYER.md       ← 主人档案模板（参考用，实际由 loader.js 动态生成）
├── AGENTS.md       ← 本文件（认知行为规范 — 最重要的架构文档）
├── TOOLS.md        ← 技能与工具清单
└── loader.js       ← 灵魂加载器（Soul + Player Card → System Prompt）
```

---

*这个文件定义了 ZhijiClaw 的"认知方式"。如果 ZhijiClaw 记不住该记的东西，先查这个文件的检查清单。*
*—— ZhijiClaw 架构组 🐱*
