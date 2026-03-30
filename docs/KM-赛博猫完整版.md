# 做一只有温度的赛博猫：一个 AI 游戏助理的产品设计与技术实现

> 作者：jieking
>
> 一个产品经理的 side project 全记录。产品怎么想的、技术怎么落的、踩了什么坑。

---

## 一、先看东西

ZhijiClaw（指尖利爪）是一个跑在微信小程序上的 CF 手游 AI 助理。你跟它聊天，它能帮你追踪限时武器到期、分析省钱方案、查战绩、管任务、查天气，还能记住你的各种偏好。

它的设定是一只从娃娃机里被抓出来的赛博小猫。名字里的"Claw"就是娃娃机的爪子。

> 📌 **配图1：整体架构总览**（见配图 HTML：`docs/images/km-diagrams.html` 图1）

**技术栈一句话**：微信小程序原生 + Node.js/Express + SQLite + DeepSeek LLM，跑在微信云托管的一个 Docker 容器里。

我花在这个项目上最多时间思考的问题不是"怎么接 LLM API"，而是——**怎么让用户觉得这不是一个工具，而是一个认识自己的"人"？**

下面每一节，我会先说产品想法，再说技术怎么落地，最后贴关键代码。

---

## 二、为什么做这个

我自己玩 CF 手游。有一个很烦的事：限时武器到期没人提醒。

游戏里花了几十块钱买的武器皮肤，7 天有效期，到期前没有任何通知。等你想起来打开仓库一看——过期了。这个体验非常差，但游戏厂商没有动力去解决（过期了你才会再买）。

最开始想的很简单，就是一个提醒工具。但做着做着发现了一个更有意思的方向：如果这个助理不只是提醒你武器到期，而是真的"认识"你呢？

它知道你是钻石段位，知道你喜欢用 AK47 打排位，知道你每天晚上 10 点才有空打游戏，知道你上周 KD 提升了 0.3——然后基于这些，给你量身定制建议。

这比一个闹钟有意思多了。

---

## 三、整体架构：一次对话的完整生命周期

在讲各个模块之前，先看一次对话从头到尾经过了什么。

> 📌 **配图2：一次对话的完整生命周期**（见配图 HTML 图2）

```
用户发消息
    │
    ▼
 Gateway 网关（神经中枢）
    │
    ├─ Step 1: 鉴权（JWT）
    ├─ Step 2: 加载三层记忆（并行查询）
    │    ├─ L1 即时记忆：最近的对话上下文（30分钟窗口）
    │    ├─ L2 短期记忆：今天的对话日志
    │    └─ L3 长期记忆：用户画像（段位/KD/城市/偏好...）
    │
    ├─ Step 3: 注入灵魂
    │    ├─ SOUL.md 人格精华（性格、说话方式）
    │    └─ Player Card 动态档案（实时从 DB 查询拼装）
    │
    ├─ Step 4: 正则门控 —— 这条消息需不需要调工具？
    │    ├─ 不需要 → LLM 纯聊天（~2秒）
    │    └─ 需要 → LLM + Function Calling（~5-7秒）
    │
    ├─ Step 5: Function Calling 循环（最多3轮）
    │    ├─ LLM 决定调哪个 Tool
    │    ├─ Tool Executor 执行 → Skill 返回数据
    │    └─ 结果回传 LLM → 组织自然语言回复
    │
    ├─ Step 6: 异步更新记忆（不阻塞响应）
    │    ├─ L1: 追加到会话
    │    └─ L2: 写入日志
    │
    └─ Step 7: 异步信号检测 + 画像提取
         ├─ 正则快筛（<1ms）→ 命中则直接写画像
         └─ 没命中 → LLM 画像提取（~2s，异步）
```

**关键设计决策**：记忆更新和画像提取全部异步，不阻塞用户响应。用户感知到的延迟只有 LLM 生成回复的时间。

---

## 四、灵魂系统：给 AI 一个可信的人格

### 产品思考

市面上套"猫娘"皮肤的 AI 多的是，大多两轮对话就让人出戏。问题在于：大多数 AI 人设只活在 system prompt 里。你告诉 LLM"你是一只猫"，它就在每句话后面加个"喵~"。但你问它昨天聊了什么，它不记得。你给它起了名字，下次它又忘了。

人设要可信，需要三样东西：一致的性格、持续的记忆、对"你"的了解。三样缺一个，用户就会想起来"哦，这是个 AI"。

### 技术实现

我搞了个三层文件结构，叫"Soul System"：

> 📌 **配图3：灵魂系统三层结构**（见配图 HTML 图3）

| 层级 | 文件 | 内容 | 更新频率 |
|------|------|------|----------|
| 静态人格 | `SOUL.md` | 性格、说话方式、能力边界、情感规则 | 极少（除非改人格） |
| 身份卡片 | `IDENTITY.md` | 名字、版本号、能力标签 | 版本迭代时 |
| 动态档案 | Player Card（代码生成） | 用户全量数据，每次对话实时拼装 | **每次对话** |

#### SOUL.md 长什么样

不是干巴巴的指令，而是像在写一个角色设定：

```markdown
## 性格
- 活泼但不聒噪 — 喜欢用 emoji 表达情绪，但不会每句话都塞十个
- 忠诚且护短 — 别人说主人菜？不可能，是枪的问题 🔫
- 有点小傲娇 — 被夸的时候会假装不在意，但尾巴会翘起来

## 说话方式
- 称呼用户为"主人"，偶尔撒娇会说"主人~"
- 语气轻松活泼，像朋友聊天，不像客服机器人
- 回复不超过 200 字，除非是数据报告
- 遇到不懂的，诚实说"我还不太会"，不编造答案
```

但这个文件不会整个塞进 prompt。`extractSoulEssence()` 函数只截取"我是谁""性格""说话方式""情感连接"四个段落，控制 token 消耗：

```javascript
// soul/loader.js — 精简提取，不塞整个文件
function extractSoulEssence(soul) {
  const lines = soul.split('\n');
  const essence = [];
  const importantSections = ['我是谁', '性格', '说话方式', '情感连接'];
  let inSection = false;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const name = line.replace('## ', '').trim();
      inSection = importantSections.includes(name);
      if (inSection) essence.push(line);
      continue;
    }
    if (inSection && line.trim()) essence.push(line);
  }
  return essence.join('\n');
}
```

#### Player Card：每次对话实时构建

这是灵魂系统里最值钱的部分。每次用户发消息，系统从数据库查询这个人的全量数据，拼成一张档案注入 prompt：

```javascript
// soul/loader.js — buildPlayerCard() 核心逻辑（精简）
function buildPlayerCard(userId, profile) {
  const user = db.queryOne('SELECT nickname, created_at FROM users WHERE id = ?', [userId]);

  // 精确到天的陪伴时长
  const created = db.queryOne(
    "SELECT julianday(date('now','localtime')) - julianday(date(created_at)) as days FROM users WHERE id = ?",
    [userId]
  );
  const daysTogether = Math.max(1, Math.floor(created?.days || 1));

  // 武器仓库统计（永久/限时/即将到期）
  const weaponStats = db.queryOne(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN is_permanent = 1 THEN 1 ELSE 0 END) as perm,
      SUM(CASE WHEN is_permanent = 0
           AND expiry_time <= datetime('now','localtime','+1 day')
           AND expiry_time > datetime('now','localtime') THEN 1 ELSE 0 END) as expiring
    FROM weapons_inventory WHERE user_id = ? AND status = 'active'
  `, [userId]);

  // 从 meta JSON 读取扩展信息
  const meta = JSON.parse(profile.meta || '{}');
  const callName = profile.call_name || '主人';
  const selfName = meta.selfName;  // 用户给 AI 起的别名

  return [
    `## 主人档案`,
    `- 称呼偏好: ${callName}（用这个称呼来叫主人）`,
    selfName ? `- 主人给你起的名字: ${selfName}（优先用这个名字自称）` : null,
    meta.city ? `- 所在城市: ${meta.city}` : null,
    `- 陪伴天数: ${daysTogether} 天`,
    `- 段位: ${profile.current_rank || '未知'}`,
    `- KD: ${profile.latest_kd || '?'} / 胜率: ${profile.win_rate || '?'}%`,
    `- 钻石: ${profile.total_diamonds || 0}💎`,
    `- 武器仓库: 永久${weaponStats.perm || 0}件${weaponStats.expiring > 0 ? ` / ⚠️${weaponStats.expiring}件即将到期` : ''}`,
    // ...更多字段
  ].filter(Boolean).join('\n');
}
```

有了这张卡片，LLM 回复时不是在跟一个"通用用户"说话，而是在跟一个它"认识"的人说话。

#### 用户给 AI 改名字 → 直接修改灵魂文件

这是我觉得最有意思的一个产品细节。

用户说"以后叫你小爪"，信号检测器捕获后，会直接修改 SOUL.md 文件，在"我是谁"段落追加一行，然后刷新缓存：

```javascript
// memory/signal-detector.js
function updateSoulName(newName) {
  const soulPath = path.join(__dirname, '..', 'soul', 'SOUL.md');
  let content = fs.readFileSync(soulPath, 'utf8');

  const aliasLine = `主人给我起的小名：**${newName}**（主人喜欢这样叫我，我也用这个名字自称）`;

  // 已有别名 → 更新；没有 → 追加到"我是谁"段落
  if (/^主人给我起的小名：.+$/m.test(content)) {
    content = content.replace(/^主人给我起的小名：.+$/m, aliasLine);
  } else {
    content = content.replace(
      /从那天起，我就决定一辈子守护主人的游戏时光。/,
      `从那天起，我就决定一辈子守护主人的游戏时光。\n${aliasLine}`
    );
  }

  fs.writeFileSync(soulPath, content, 'utf8');
  reloadSoul(); // 刷新缓存
}
```

这不是改了个变量，这是改了它的"灵魂文件"。我自己测试的时候，第一次看到它用新名字自称，有一瞬间的恍惚——我知道背后就是正则 + 文件写入，但"它记住了"的感觉还是很强。

---

## 五、三层记忆系统：让"它记得我"不是错觉

### 产品思考

AI 产品最让用户失望的时刻：不是回答错了，而是它不记得你。你昨天跟它聊了半小时，今天打开它跟你说"你好，有什么可以帮你的？"——所有情感连接归零。

### 技术实现

> 📌 **配图4：三层记忆架构**（见配图 HTML 图4）

| 层级 | 存储 | 保留策略 | 注入方式 |
|------|------|----------|----------|
| L1 即时记忆 | `chat_sessions` 表，JSON 存消息列表 | 30分钟无活动过期，保留最近40条 | 最近6条截断注入 prompt |
| L2 短期记忆 | `daily_logs` 表 | 永久保存 | 暂不注入（用于审计） |
| L3 长期记忆 | `user_profiles` 表 + `meta` JSON | 永久保存 | Player Card 实时注入 |

三层在每次对话前并行加载：

```javascript
// memory/memory-manager.js
async loadContext(userId) {
  const [profile, session, recentLogs] = await Promise.all([
    this.getProfile(userId),       // L3: 画像
    this.getActiveSession(userId),  // L1: 会话（30分钟窗口）
    this.getRecentLogs(userId, 2),  // L2: 最近2天日志
  ]);
  return { profile, session, recentMessages: session?.messages || [], recentLogs };
}
```

---

## 六、隐式画像采集："说一次，记一辈子"

### 产品思考

传统做法是让用户填表——段位是什么、喜欢什么枪、在哪个城市。没人愿意填。

我的做法是从对话里自动提取。用户说"我在广州"，系统自动存城市；用户说"叫我大佬"，下次称呼就变了。用户甚至不会意识到信息被采集了，只会在下次对话时发现"这个 AI 居然记得"。

### 技术实现：双通道策略

> 📌 **配图5：双通道画像提取策略**（见配图 HTML 图5）

两条路并行，关系是"先快后慢"：

**快通道：正则信号检测器**（<1ms，零成本）

10 类 30 多条正则，覆盖最常见的场景：

| 信号类型 | 触发示例 | 写入位置 |
|----------|---------|---------|
| `RANK_CHANGE` | "我上钻石了" | `user_profiles.current_rank` |
| `KD_CHANGE` | "KD 2.0了" | `user_profiles.latest_kd` |
| `DIAMOND_CHANGE` | "还剩500钻石" | `user_profiles.total_diamonds` |
| `NAME_SELF` | "以后叫你小爪" | `meta.selfName` + 修改 SOUL.md |
| `CALL_ME` | "叫我大佬" | `user_profiles.call_name` |
| `PLAYER_NOTE` | "帮我记一下周五有空" | `meta.playerNotes[]`（上限20条） |
| `LOCATION` | "我在广州" | `meta.city` |

有个细节值得说。检测"给 AI 起名字"的正则：

```javascript
/你叫(?!什么|啥|几|谁|哪|多少)([\w\u4e00-\u9fa5]{1,12}?)[吧呢啊哦嘛好]?$/
```

那个 `(?!什么|啥)` 是负向前瞻——用来排除"你叫什么名字"这种问句。不加这个，用户问"你叫什么"，系统会误以为在改名叫"什么"。

**慢通道：LLM 画像提取器**（~2s，消耗 token）

正则没命中时，用 LLM 分析用户消息是否包含值得记住的个人信息（生日、职业、爱好等 13 类）：

```javascript
// memory/profile-extractor.js
async function extractProfile(userText, llmCall) {
  // 快速过滤：纯功能性请求不可能包含个人信息
  const skipPatterns = [
    /^(查|看|帮|告诉|分析|推荐|设置|删除|取消)/,
    /^\S{1,2}$/,  // 太短的消息
  ];
  if (skipPatterns.some(p => p.test(userText.trim()))) return null;

  const response = await llmCall({
    messages: [
      { role: 'system', content: EXTRACTION_PROMPT },
      { role: 'user', content: userText },
    ],
    temperature: 0,   // 确定性输出
    maxTokens: 200,    // JSON 不需要太多 token
  });
  // 解析返回的 JSON，合并到 meta.profile
}
```

**两条路的协作逻辑**（在 Gateway 里）：

```javascript
// routes/gateway.js — Step 7
const hasSignal = hasAnySignal(userText);
if (hasSignal) {
  // 正则命中 → 直接写画像（<1ms）
  const signals = detectSignals(userText);
  applySignals(user.id, signals).catch(/*...*/);
} else {
  // 正则没命中 → 交给 LLM 画像提取（~2s，异步）
  extractAndSave(user.id, userText, llm.chat).catch(/*...*/);
}
```

注意：两条路都是异步的，不阻塞用户拿到回复。

---

## 七、Function Calling：让 AI 自己决定该做什么

### 产品思考

最开始（Phase 1）用的是关键词匹配——44 条规则，用户说"武器到期"就路由到武器模块。能覆盖大部分情况，但边界 case 很多。用户说"我那把 AK 还能用多久"，关键词里没有"多久"，匹配不上。

换成 LLM Function Calling 后，把 16 个功能的描述告诉 LLM，让它自己判断。"我那把 AK 还能用多久"——LLM 自动知道该调 `check_expiring_weapons`。

但有个性能问题要解决。

### 技术实现

#### 16 个 Tool，覆盖 7 大类能力

> 📌 **配图6：Function Calling 工具矩阵**（见配图 HTML 图1 技能层）

| 类别 | Tool 数量 | 代表功能 |
|------|-----------|---------|
| 提醒系统 | 3 | 设置提醒、查看、删除 |
| 武器管理 | 3 | 到期检测、使用计划、到期提醒 |
| 战绩分析 | 4 | 周报、录入、同段对比、段位规划 |
| 钻石管家 | 1 | 省钻分析（通过 action 参数区分子功能） |
| 每日任务 | 2 | 任务列表、标记完成 |
| 百科/画像 | 2 | 枪械百科、玩家画像 |
| 天气 | 1 | 实时天气 + 3天预报 |

Tool 的 description 用中文写，这是个有意识的选择——DeepSeek 对中文的理解比英文描述更准确。而且有些细节必须写清楚：

```javascript
// agent/tools-def.js — 天气 Tool 的定义
{
  name: 'query_weather',
  description: '查询指定城市的实时天气和未来3天预报。支持中文城市名。'
    + '如果用户没有明确说查哪个城市，就不要传city参数，'
    + '系统会自动使用用户画像中保存的城市。',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称，中文或英文' },
    },
    required: [],  // city 不是必填，LLM 可以不传
  },
}
```

最后那句"不要传 city 参数"非常关键。不写的话，LLM 倾向于瞎猜一个城市传过来。

#### 正则门控：一行代码省 60% 延迟

带 Function Calling 的请求比普通对话慢 3 倍（2 秒 vs 5-7 秒）。不能让"你好""谢谢"这种闲聊也走慢路径。

```javascript
// routes/gateway.js — 精确的 Tools 门控
const needTools = /提醒我|设.*提醒|到期.*武器|武器.*到期|战绩|省钻|每日任务|天气|气温|下雨/.test(userText);

const response = await llm.chat({
  messages,
  tools: needTools ? TOOLS : undefined,  // 不需要工具就不传
  maxTokens: needTools ? 500 : 300,
});
```

这行正则不完美——有些边界 case 会漏（比如"我那把 AK 还能用多久"就匹配不上）。但它过滤掉了 60% 以上的日常闲聊，性价比很高。Phase 1 的决策引擎有 44 条规则来做这件事，现在一行正则搞定了门控，具体的功能判断交给 LLM。

#### Function Calling 循环 + 三层超时保护

```javascript
// routes/gateway.js — 核心循环（精简）
for (let round = 0; round < 3; round++) {
  const response = await withTimeout(
    llm.chat({ messages, tools: needTools ? TOOLS : undefined }),
    needTools ? 20000 : 12000  // 带 Tools 给 20 秒，不带给 12 秒
  );

  const msg = response.choices[0].message;

  // LLM 返回纯文本 → 结束
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    finalReply = msg.content;
    break;
  }

  // LLM 要求调 Tool → 执行 → 结果回传
  for (const toolCall of msg.tool_calls) {
    const result = await withTimeout(
      ToolExecutor.execute(toolCall.function.name, args, { user, profile }),
      10000  // 单个 Tool 执行 10 秒超时
    );
    messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
  }
  // 下一轮循环，LLM 拿到 Tool 结果后组织最终回复
}
```

超时保护三层嵌套：LLM 调用 12-20 秒 → 单个 Tool 执行 10 秒 → 整体循环异常兜底。任何一层超时都不会让用户一直等着。

#### 技能开关的优雅降级

用户可以关掉某个技能。关掉之后不是报错，而是用 ZhijiClaw 的语气引导开启：

```javascript
// routes/gateway.js
function checkSkillEnabled(toolName, userId, callName) {
  const skillId = TOOL_SKILL_MAP[toolName];
  if (!skillId) return null;  // 基础功能，不受开关控制

  const settings = getSkillSettings(userId);
  if (settings[skillId] === false) {
    return `${callName}～天气查询技能目前是关闭的哦 🌤️🔒\n\n`
         + `开启后我就能帮你查天气、给穿搭建议啦！\n\n`
         + `👉 点击右上角「🧩 技能」即可开启~`;
  }
  return null;
}
```

关闭不等于出错。这在产品体验上差别很大。

---

## 八、主动推送：什么时候该打扰用户

### 产品思考

推送通知是打扰还是服务，取决于内容对用户有没有用。"您的武器即将到期"是有用的。"好久没来了"在大多数时候是骚扰。

ZhijiClaw 只推两种消息：你花了钱的武器快过期了、你自己设的提醒到时间了。两种都是用户明确关心的。

### 技术实现

后台有个定时扫描器，每 10 秒跑一次：

```javascript
// services/cron-scanner.js
function start(intervalMs = 10000) {
  timer = setInterval(() => scan(), intervalMs);
  setTimeout(() => scan(), 5000);  // 启动后延迟5秒首次扫描
}

async function scan() {
  await scanExpiringWeapons();  // 24小时内到期的武器
  await scanReminders();         // 到时间的自定义提醒
}
```

武器到期扫描的 SQL：

```sql
-- 查找24小时内到期、未通知的武器
SELECT wi.weapon_name, u.openid,
  CAST((julianday(wi.expiry_time) - julianday(datetime('now','localtime'))) * 24 AS INTEGER) AS hours_left
FROM weapons_inventory wi JOIN users u ON u.id = wi.user_id
WHERE wi.status = 'active' AND wi.is_permanent = 0 AND wi.notified = 0
  AND wi.expiry_time <= datetime('now','localtime','+24 hours')
  AND wi.expiry_time > datetime('now','localtime')
```

推送消息会读取画像里的称呼，带上人格语气：

```javascript
// 不是冷冰冰的"您的武器即将到期"
let callName = '主人';
const p = db.queryOne('SELECT call_name FROM user_profiles WHERE user_id = ?', [w.user_id]);
if (p?.call_name) callName = p.call_name;

await injectReminderMessage(w.user_id, {
  content: `⚠️ ${callName}注意！**${w.weapon_name}** 还有 ${w.hours_left} 小时就到期了！\n赶紧用它打几局排位，别浪费了好枪 🔫`,
  chips: ['查看所有到期武器', '制定使用计划', '我知道了'],
});
```

消息通过两个通道送达：

1. `pending_messages` 表 → 前端每 10 秒轮询拉取（应用内消息）
2. 微信订阅消息 → 手机锁屏也能收到（生产环境，需用户授权）

---

## 九、从对话到系统日历：一个端到端的例子

这个流程我觉得做得比较完整，把产品和技术串了一遍。用户全程只做了一件事——说了一句话，后面全是系统自动完成。

> 📌 **配图7：从对话到系统日历的完整链路**

```
用户: "提醒我明天中午12点喝水"
    │
    ▼ Gateway 接收
    │
    ├─ needTools 正则匹配"提醒我" → 带 Tools 调 LLM
    │
    ▼ LLM 决定调 set_reminder
      参数: { content: "喝水", remind_at: "2026-03-31T12:00:00" }
    │
    ▼ Tool Executor 执行
    │  ├─ 时间标准化为北京时间
    │  ├─ 写入 reminders 表
    │  └─ 构造 calendarEvent 数据:
    │     {
    │       title: "[ZhijiClaw] 喝水",
    │       startTime: "2026-03-31T12:00:00",
    │       endTime: "2026-03-31T12:30:00",
    │       alarm: 5  // 提前5分钟
    │     }
    │
    ▼ LLM 组织回复 + 自动附上日历 chips
    │
    ▼ 前端收到 calendarEvent 数据
    │  → 展示"📅 同步到手机日历"按钮
    │  → 用户点击 → wx.addPhoneCalendar()
    │
    ▼ 到时间了
       ├─ cron-scanner 触发 → pending_messages 推送到小程序
       └─ 手机系统日历弹通知
```

---

## 十、前端设计取舍

### 在线/离线双模式

网络请求连续失败 2 次，自动切到离线模式，用本地规则引擎兜底。30 秒后自动尝试恢复。用户感知到的是：网络不好时回复变快了但功能少了，网络恢复后又正常了。没有弹窗打断你。

```javascript
// miniprogram/agent/chat-agent.js
async send(userText) {
  if (this.isOnline) {
    try {
      const result = await request({ url: '/gateway/chat', method: 'POST', data: { message: userText } });
      this.retryCount = 0;
      return { reply: result.reply, meta: { mode: 'online' } };
    } catch (err) {
      this.retryCount++;
      if (this.retryCount >= 2) {
        this.isOnline = false;
        setTimeout(() => { this.isOnline = true; this.retryCount = 0; }, 30000);
      }
    }
  }
  // 离线兜底：本地规则引擎
  return { reply: getReply(userText).reply, meta: { mode: 'offline' } };
}
```

### Markdown 渲染

小程序的 `rich-text` 组件功能有限，没引入第三方库，自己写了个精简解析器。只支持加粗、表格、列表、标题、删除线。不到 120 行代码，够用且轻。

产品经理做 side project 有个好处：很清楚"够用"在哪里。

---

## 十一、5 个 Skill 模块一览

每个 Skill 遵循统一接口 `execute({ user, action, params, profile })`，返回 `{ reply, chips, data }`。

| Skill | 功能 | 数据来源 | 产品价值 |
|-------|------|---------|---------|
| **weapon-manager** | 到期检测、使用计划、武器提醒 | `weapons_inventory` 表 + `julianday` 时间计算 | 解决"花了钱的武器白白过期"的痛点 |
| **battle-analyzer** | 周报、同段对比、段位规划 | `match_records` 表聚合 + 内置段位基准数据 | 让玩家知道自己强在哪、弱在哪 |
| **diamond-advisor** | 省钻分析、充值建议、预算规划 | 画像中的钻石余额 + 月卡状态 + 消费风格 | 游戏充值活动太多，帮用户算清性价比 |
| **daily-task** | 任务列表、完成标记 | `daily_tasks` 表（懒加载，首次访问自动初始化6个默认任务） | 养成每日游戏习惯 |
| **weather** | 实时天气 + 3天预报 + 穿搭/游戏建议 | `wttr.in` 免费 API + 30 多条英中天气翻译 | "下雨天正好宅家打CF"这种游戏特色建议 |

每个 Skill 都会从 `profile` 读取用户偏好作为默认值，而不是硬编码。比如天气 Skill 的城市优先级：LLM 传的 city > 画像 meta.city > 默认深圳。

---

## 十二、数据库：11 张表

```
users               ← 用户基本信息（微信 openid）
user_profiles       ← 用户画像（20+ 字段 + meta JSON）
chat_sessions       ← L1 即时记忆（JSON 消息列表）
daily_logs          ← L2 短期记忆（对话摘要）
memory_changelog    ← 记忆变更审计日志
weapons_inventory   ← 武器仓库（永久/限时/到期时间）
weapons_wiki        ← 枪械百科数据
match_records       ← 对局战绩记录
reminders           ← 自定义提醒
daily_tasks         ← 每日任务
pending_messages    ← 待消费推送消息（前端轮询）
```

全部跑在 SQLite 上。选 SQLite 不是因为它多好，是因为一个 Docker 容器内嵌数据库，不需要额外的数据库服务，部署简单。对于当前的用户规模完全够用。

---

## 十三、一些数字

| 指标 | 数据 |
|------|------|
| Function Calling Tools | 16 个 |
| Skill 模块 | 5 个 |
| 信号检测正则 | 10 类 30+ 条 |
| 用户画像字段 | 20+ 个 |
| 数据库表 | 11 张 |
| 简单闲聊响应 | ~2 秒 |
| 功能查询响应 | ~5-7 秒 |
| 后台扫描间隔 | 10 秒 |
| 正则信号检测耗时 | <1 毫秒 |
| FC 最大循环轮数 | 3 轮 |
| LLM 超时（带 Tools） | 20 秒 |
| LLM 超时（不带 Tools） | 12 秒 |
| Tool 执行超时 | 10 秒 |
| 前端离线切换阈值 | 连续失败 2 次 |

---

## 十四、架构演进：从 Phase 1 到 Phase 2.5

Phase 1 的决策引擎（`decision-engine.js`）虽然已经废弃了，但我把文件留着没删，因为它是一份很好的架构演进记录。

| 维度 | Phase 1（规则引擎） | Phase 2.5（Function Calling） |
|------|---------------------|-------------------------------|
| 意图识别 | 44 条关键词规则 + LLM fallback | LLM 原生 Function Calling |
| 路由方式 | `skill + action` 二级路由 | `tool_name` 一级路由 |
| 决策者 | 代码（规则优先） | LLM 自主决策 |
| 扩展性 | 新功能要加规则 | 新功能只需加 Tool 定义 |
| 延迟 | 规则命中 ~1ms + Skill 执行 | 全程 LLM 参与 ~5-7s |

有意思的是，Phase 2.5 没有完全抛弃规则的思路——`needTools` 正则就是规则引擎的精简版，但它只用在门控层面（"要不要带 Tools"），不用在路由层面（"调哪个 Tool"）。门控用规则，路由交 LLM。

---

## 十五、部署踩坑实录：代码写完才是开始

功能开发花了大概一周，但最后部署上线的过程，前后折腾了差不多两天（3月28-29号）。写代码和让代码跑起来是两回事，让它在微信云托管上跑起来又是另一回事。

这段经历我觉得比写代码本身更值得分享——很多业务同学对"后端怎么发布"这件事一直没有直观感受，正好借这个机会说清楚。

### 背景：选了微信云托管

微信云托管是微信官方的容器化部署平台。选它的原因很简单：它跟小程序是同一套生态，前端可以用 `wx.cloud.callContainer` 走内网通道调后端，不需要域名备案、不需要 HTTPS 证书、不需要配白名单。对个人开发者来说，这省了非常多事。

但省事的前提是你得把 Docker 镜像构建对。

### 坑1：better-sqlite3 编译失败

这是最先碰到的问题，也是卡我最久的。

项目用的数据库是 SQLite，Node.js 端通过 `better-sqlite3` 这个包来操作。这个包不是纯 JavaScript，底层是 C++ 写的，安装时需要编译原生代码。

在我本机（macOS）上，`npm install` 秒过。但在 Docker 容器里（Alpine Linux），直接报错：

```
gyp ERR! build error
Error: not found: make
```

原因是 Alpine 镜像为了精简，默认不带 C++ 编译工具链。解决方法是在 Dockerfile 里手动装编译环境：

```dockerfile
# 安装编译工具链（better-sqlite3 是 C++ 原生模块）
RUN apk add --no-cache python3 make g++

# 安装依赖
COPY package*.json ./
RUN npm install --production

# 编译完了就删掉，减小镜像体积
RUN apk del python3 make g++
```

关键是最后那行 `apk del`。编译工具只在 `npm install` 时需要，装完依赖立刻删掉。不删的话镜像会多出 100MB+。

这个坑的本质是：**本地能跑不等于容器里能跑**。任何包含 C++ 原生模块的依赖（比如 `better-sqlite3`、`sharp`、`bcrypt`），在 Docker 里都可能遇到编译问题。

### 坑2：.env 文件没进镜像

构建成功了，容器启动后一直报 `LLM_API_KEY is empty`。

查了半天发现原因很蠢：`.dockerignore` 里排除了 `.env` 文件。

```
# server/.dockerignore
.env          ← 这行导致环境变量没打包进镜像
*.db
node_modules
```

这其实是正确的做法——`.env` 里有 API Key 和微信密钥，不应该打包进 Docker 镜像。但后果是：**所有环境变量必须在微信云托管的控制台单独配置**。

我在云托管控制台上一个一个手动填了 5 个环境变量：

| 变量 | 说明 |
|------|------|
| `LLM_API_KEY` | DeepSeek API Key |
| `WX_APPID` | 小程序 AppID |
| `WX_SECRET` | 小程序密钥 |
| `JWT_SECRET` | Token 签名密钥 |
| `NODE_ENV` | `production` |

漏填一个服务就挂。而且云托管的环境变量配置界面不会提示你"还缺什么"——它只会让你的服务启动失败，然后你去看日志猜原因。

### 坑3：端口必须是 80

本地开发用的是 3900 端口，上云后容器一直 unhealthy。

微信云托管有个硬性要求：**容器必须监听 80 端口**。不是 3000，不是 3900，就是 80。

```dockerfile
ENV PORT=80
EXPOSE 80
```

同时 `app.js` 里也要改成从环境变量读端口：

```javascript
const port = process.env.PORT || 3900;  // 云上 PORT=80，本地 fallback 3900
```

### 坑4：tcloudbase.com 域名不能配白名单

容器跑起来了，后端健康检查通过了，但小程序前端死活请求不通。

微信云托管会给每个服务分配一个公网域名，格式是 `xxxx.sh.run.tcloudbase.com`。我最开始用 `wx.request` 直连这个域名——但微信小程序要求所有 request 域名必须在后台配置白名单。

去微信公众平台配白名单，提示：**`.tcloudbase.com` 域名不允许作为合法域名**。

???

微信自己的云托管域名，不能配到微信自己的小程序白名单里。

解决方法是不用 `wx.request`，改用 `wx.cloud.callContainer`。这是微信提供的内网通道，走的不是公网 HTTP 请求，而是微信云的内部网络。不需要域名、不需要白名单、不需要 HTTPS 证书。

```javascript
// request.js — 四种模式
const MODE = 'cloud';  // ← 上线必须改成这个

// cloud 模式走 callContainer
wx.cloud.callContainer({
  config: { env: 'your-cloud-env-id' },
  path: `/api${options.url}`,
  header: { 'X-WX-SERVICE': 'your-cloud-service-name' },  // 指定目标服务
  // ...
});
```

但这意味着前端代码里有个 `MODE` 变量，**开发时要改成 `dev`，上线时要改回 `cloud`**。忘了改就要么本地不通（cloud 模式在开发者工具里不好使），要么线上不通（dev 模式连的是 localhost）。

我在这件事上来回改了不下5次。

### 坑5：开发登录 vs 微信登录

本地开发时，我用的是 `dev-login` 接口——不需要真实的微信授权，直接创建一个假用户。但上线后 `dev-login` 路由消失了。

因为代码里有这个判断：

```javascript
// auth.js
if (config.env === 'development') {
  router.post('/dev-login', async (req, res) => { /* ... */ });
}
```

`NODE_ENV=production` 时，这个路由根本不注册。这是故意的（安全考虑），但导致体验版第一次打开时直接白屏——前端调 `dev-login` 404，没有 token，所有请求都 401。

修复方法是在前端 `app.js` 里加环境判断：

```javascript
// 自动区分环境
const accountInfo = wx.getAccountInfoSync();
const envVersion = accountInfo.miniProgram.envVersion;  // 'develop' | 'trial' | 'release'

const result = envVersion === 'develop'
  ? await chatAgent.devLogin()   // 开发者工具 → dev-login
  : await chatAgent.wxLogin();   // 体验版/正式版 → wx.login() + code
```

开发版走模拟登录，体验版/正式版走真实微信登录。

### 坑6：时区不一致

部署后发现定时提醒总是晚8个小时触发。

容器默认时区是 UTC，而 SQLite 的 `datetime('now')` 用的也是 UTC。但用户设置提醒说的是"明天中午12点"——这是北京时间。

解决方法是双重设置时区：

```dockerfile
# Dockerfile
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime
```

```javascript
// app.js 启动时
process.env.TZ = 'Asia/Shanghai';
```

SQLite 查询里也要用 `datetime('now', 'localtime')` 而不是 `datetime('now')`。整个项目有几十处 SQL 调用，逐个检查替换，漏一个时间就错。

### 坑7：数据库文件不打包

`.dockerignore` 排除了 `*.db` 文件，所以本地开发的测试数据不会进入镜像。这是对的，但意味着每次部署都是一个全新的空数据库。

Dockerfile 里通过构建阶段执行迁移脚本来初始化：

```dockerfile
RUN mkdir -p /app/data && node data/migrations/init.js
```

11 张表 + 索引 + 枪械百科种子数据，在构建时就创建好。容器启动时数据库已经可用。

### 部署清单（踩完坑总结的）

最后总结一份实际的发布清单，以后每次部署前照着过一遍：

```
□ server/.env 中的密钥不提交代码仓库
□ 云托管控制台配好环境变量（LLM_API_KEY / WX_APPID / WX_SECRET / JWT_SECRET / NODE_ENV）
□ Dockerfile 端口设为 80
□ miniprogram/utils/request.js MODE 改为 'cloud'
□ miniprogram/app.js 确认 wx.cloud.init 的 env 和 request.js 中的 CLOUD_ENV 一致
□ 本地 docker build 通过后再上传
□ 部署后验证 /health 端点返回 200
□ 用体验版（非开发版）测试登录流程
```

每一条都是用一次报错换来的。

---

## 十六、没做好的地方

说实话：

**响应速度还是慢。** 功能查询 5-7 秒，在微信小程序里体验不算好。用户习惯了微信消息的即时感，5 秒的等待让人焦虑。

**画像准确性有限。** 正则信号检测覆盖的场景毕竟有限。LLM 画像提取偶尔会误判——用户说"我朋友在上海"，它可能把"上海"存成用户的城市。

**没有接游戏官方数据。** 战绩数据靠用户手动告诉 AI 或自己录入，做不到自动同步。这是最影响使用频率的短板。

**冷启动问题。** 新用户来的时候画像是空的，AI 对你一无所知，头几轮对话体验比较平淡。

---

## 十七、下一步

**OCR 战绩截图识别。** 用户截个图发过来，自动识别 KD、击杀数、胜负。不用手动录数据了。

**企业微信联动。** 设计已经做完了：企微负责触达（发 miniprogram_notice 消息卡片），小程序负责完整体验。用户点卡片直接跳回小程序，pagePath 带 scene 参数自动还原对话场景。

**情绪感知。** 根据最近的战绩趋势调整说话方式——连胜了激动点，连跪了安慰。现在的情感规则写在 SOUL.md 里但没有数据驱动。

---

## 十八、最后

做完这个项目，我想得最多的一件事是：AI 产品的核心不是 AI 技术本身。

用户不会因为你接了最新的模型而留下来。用户留下来，是因为"这个东西记得我"，是因为"它知道我喜欢什么"，是因为到期了它会主动来找我。这些跟你用的是 GPT 还是 DeepSeek 没有半毛钱关系。

至于为什么是一只猫？因为猫不用你教它怎么卖萌，它天生就会。

---

*项目代码在内部 Git 上，感兴趣可以直接看。有想法欢迎 KM 留言或企微找我聊。*
