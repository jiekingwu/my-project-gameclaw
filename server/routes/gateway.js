/**
 * Gateway 网关路由 — ZhijiClaw 的神经中枢（Phase 2.5）
 *
 * POST /api/gateway/chat           — 统一对话入口（LLM + Function Calling）
 * GET  /api/gateway/profile         — 获取用户画像
 * GET  /api/gateway/alerts          — 获取智能提醒
 * POST /api/gateway/match-record    — 快速录入战绩
 * GET  /api/gateway/pending-messages — 轮询未消费消息
 *
 * 对话流程：鉴权 → 加载记忆 → LLM + Tools 循环(最多5轮) → 更新记忆 → 返回
 */
const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const llm = require('../agent/llm-client');
const TOOLS = require('../agent/tools-def');
const ToolExecutor = require('../agent/tool-executor');
const memoryManager = require('../memory/memory-manager');
const { hasAnySignal, detectSignals, applySignals } = require('../memory/signal-detector');
const { buildSystemPrompt } = require('../soul/loader');
const db = require('../data/database');

// ===== 统一对话入口（Phase 2.5: Function Calling） =====
router.post('/chat', authRequired, async (req, res, next) => {
  try {
    const { message, channel = 'miniapp' } = req.body;
    const user = req.user;

    if (!message || !message.trim()) {
      return res.status(400).json({ code: 400, message: '消息不能为空' });
    }

    const userText = message.trim();
    const startTime = Date.now();

    // Step 1: 加载记忆上下文
    const context = await memoryManager.loadContext(user.id);
    const profile = context.profile || {};

    // Step 2: 构建 LLM 消息（SOUL + Player Card 动态注入）
    const systemPrompt = buildSystemPrompt(user.id, profile);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...context.recentMessages.slice(-6).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content.slice(0, 200) : '',
      })),
      { role: 'user', content: userText },
    ];

    // Step 3: 精确判断是否需要 Function Calling
    // 只有明确的功能性请求才走 Tools 路径（带Tools约7秒，不带约2秒）
    // 去掉了"帮我""查看""分析""设置"等泛化词，避免简单对话也走慢路径
    const needTools = /提醒我|设.*提醒|查看.*提醒|所有提醒|我的提醒|到期.*武器|武器.*到期|查.*武器|战绩|录入.*对局|省钻|充值.*方案|每日任务|完成.*任务|段位.*规划|KD|kd|配枪|枪械.*数据|删除.*提醒|钻石.*分析|分析.*钻石|武器库|武器.*快|天气|气温|下雨|穿什么/.test(userText);

    let finalReply = '';
    let finalChips = [];
    let finalData = null;
    let toolsUsed = [];

    // 动态称呼（从画像读取，替代硬编码"主人"）
    const callName = profile.call_name || '主人';

    // 给 LLM 调用加超时保护：单次调用最长15秒
    const withTimeout = (promise, ms) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`请求超时 (${ms}ms)`)), ms)),
      ]);
    };

    try {
      for (let round = 0; round < 3; round++) {
        let response;
        try {
          response = await withTimeout(llm.chat({
            messages,
            tools: needTools ? TOOLS : undefined,
            temperature: 0.7,
            maxTokens: needTools ? 500 : 300,
          }), needTools ? 20000 : 12000); // 带Tools给20秒，不带给12秒
        } catch (llmErr) {
          console.error('[Gateway] LLM 调用失败:', llmErr.message);
          finalReply = `收到${callName}！不过我现在有点卡，稍等一下再试试～ 😅`;
          break;
        }

        if (!response || !response.choices || !response.choices[0]) {
          console.error('[Gateway] LLM 返回格式异常:', JSON.stringify(response)?.slice(0, 200));
          finalReply = `收到${callName}！我好像有点迷糊了，再问我一次吧 🤔`;
          break;
        }

        const choice = response.choices[0];
        const msg = choice.message;

        // 如果 LLM 返回了纯文本回复（没有 Tool 调用）
        if (choice.finish_reason === 'stop' || !msg.tool_calls || msg.tool_calls.length === 0) {
          finalReply = msg.content || '';
          break;
        }

        // LLM 要求调用 Tool
        messages.push(msg); // 把 assistant 的 tool_calls 加入历史

        for (const toolCall of msg.tool_calls) {
          const funcName = toolCall.function.name;
          let funcArgs = {};
          try {
            funcArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch (_) {}

          console.log(`[Gateway] Tool Call: ${funcName}(${JSON.stringify(funcArgs)})`);
          toolsUsed.push(funcName);

          // 检查技能开关：关闭的技能不执行，返回引导话术
          const skillBlockMsg = checkSkillEnabled(funcName, user.id, callName);
          if (skillBlockMsg) {
            console.log(`[Gateway] 技能已关闭，拦截 ${funcName}`);
            finalReply = skillBlockMsg;
            finalChips = ['🧩 打开技能面板', '换个问题'];
            // 告诉 LLM 技能已关闭
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success: false, summary: '该技能已被用户关闭，请引导用户在技能面板中开启' }),
            });
            break; // 不再执行后续 Tool
          }

          // 执行 Tool（超时10秒）
          let result;
          try {
            result = await withTimeout(
              ToolExecutor.execute(funcName, funcArgs, { user, profile }),
              10000
            );
          } catch (toolErr) {
            console.error(`[Gateway] Tool ${funcName} 执行失败:`, toolErr.message);
            result = { success: false, summary: `工具执行出错: ${toolErr.message}` };
          }

          // 如果 Skill 返回了完整回复，暂存
          if (result.reply) {
            finalReply = result.reply;
            finalChips = result.chips || [];
          }
          // 始终暂存 data（含 calendarEvent 等结构化数据）
          if (result.data) {
            finalData = result.data;
          }

          // 把 Tool 结果加入消息历史，让 LLM 组织最终回复
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result.summary || result.data || result),
          });
        }
      }
    } catch (loopErr) {
      console.error('[Gateway] Function Calling 循环异常:', loopErr.message);
      if (!finalReply) {
        finalReply = `收到${callName}！处理过程中出了点小问题 😅\n\n我可以帮你：\n• 🔫 枪械数据查询\n• 🎯 排位攻略建议\n• 💎 省钻方案分析\n\n你想了解哪个方向？`;
      }
    }

    // 如果 LLM 没返回内容但 Tool 有回复，直接用 Tool 的回复
    if (!finalReply) {
      finalReply = `收到${callName}！让我帮你看看 🔍\n\n我可以帮你：\n• 🔫 枪械数据查询\n• 🎯 排位攻略建议\n• 💎 省钻方案分析\n\n你想了解哪个方向？`;
      finalChips = ['查枪械', '看攻略', '省钻建议'];
    }

    const elapsed = Date.now() - startTime;

    // Step 4: 更新记忆（异步，不阻塞响应）
    updateMemoryAsync(user.id, context, userText, toolsUsed, finalReply).catch(err => {
      console.error('[Memory] 更新失败:', err.message);
    });

    // Step 5: 信号检测 → 自动写入画像（正则，<1ms）
    const hasSignal = hasAnySignal(userText);
    if (hasSignal) {
      const signals = detectSignals(userText);
      if (signals.length > 0) {
        applySignals(user.id, signals).catch(err => {
          console.error('[Signal] 写入画像失败:', err.message);
        });
      }
    }

    // Step 5.5: LLM 画像提取（正则没命中时才调，省 token）
    if (!hasSignal) {
      const { extractAndSave } = require('../memory/profile-extractor');
      extractAndSave(user.id, userText, (opts) => llm.chat(opts)).catch(err => {
        console.warn('[ProfileExtractor] 异步提取失败:', err.message);
      });
    }

    // Step 6: 如果设置了提醒且有日历事件数据，确保 chips 里有「同步到日历」按钮
    let calendarEvent = null;
    if (toolsUsed.includes('set_reminder') && finalData?.calendarEvent) {
      calendarEvent = finalData.calendarEvent;
      // 确保 chips 里有日历同步选项
      if (!finalChips.some(c => c.includes('日历'))) {
        finalChips = ['📅 同步到手机日历', '查看所有提醒', ...finalChips].slice(0, 4);
      }
    }

    // Step 7: 返回响应
    res.json({
      code: 0,
      data: {
        reply: finalReply,
        chips: finalChips.length > 0 ? finalChips : extractChipsFromReply(finalReply),
        data: finalData,
        calendarEvent, // 如果有日历事件，前端用这个数据调 wx.addPhoneCalendar
        meta: {
          source: toolsUsed.length > 0 ? 'function_calling' : 'llm_direct',
          tools: toolsUsed,
          elapsed: `${elapsed}ms`,
        },
      },
    });
  } catch (err) {
    console.error('[Gateway] 对话处理出错:', err);
    next(err);
  }
});

/**
 * 从 LLM 回复中提取建议 chips
 */
function extractChipsFromReply(reply) {
  if (!reply) return ['查看每日任务', '战绩分析', '省钻攻略'];
  // 简单的话题相关推荐
  const topics = [];
  if (/武器|到期|枪/.test(reply)) topics.push('查看到期武器');
  if (/钻石|省钻|充值/.test(reply)) topics.push('省钻攻略');
  if (/段位|排位|战绩/.test(reply)) topics.push('战绩分析');
  if (/任务/.test(reply)) topics.push('查看每日任务');
  if (/提醒/.test(reply)) topics.push('查看所有提醒');
  return topics.length > 0 ? topics.slice(0, 3) : ['查看每日任务', '战绩分析', '省钻攻略'];
}

/**
 * 异步更新记忆
 */
async function updateMemoryAsync(userId, context, userText, toolsUsed, reply) {
  const session = context.session;

  // L1: 追加到会话
  if (session?.session_id) {
    await memoryManager.appendToSession(userId, session.session_id, {
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    });
    await memoryManager.appendToSession(userId, session.session_id, {
      role: 'assistant',
      content: reply?.slice(0, 500),
      timestamp: Date.now(),
    });
  }

  // L2: 写入日志
  await memoryManager.appendDailyLog(userId, {
    input: userText,
    intentSkill: toolsUsed.join(',') || 'chat',
    outputSummary: reply?.slice(0, 200),
  });
}

// ===== 获取用户画像 =====
router.get('/profile', authRequired, async (req, res, next) => {
  try {
    const context = await memoryManager.loadContext(req.user.id);
    const profile = context.profile || {};

    const weaponStats = await db.queryOne(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_permanent = 1 THEN 1 ELSE 0 END) as permanent,
        SUM(CASE WHEN is_permanent = 0 AND expiry_time > datetime('now', 'localtime') THEN 1 ELSE 0 END) as temporary,
        SUM(CASE WHEN is_permanent = 0 AND expiry_time <= datetime('now', 'localtime', '+1 day') AND expiry_time > datetime('now', 'localtime') THEN 1 ELSE 0 END) as expiring_soon
       FROM weapons_inventory WHERE user_id = ? AND status = 'active'`,
      [req.user.id]
    );

    res.json({
      code: 0,
      data: {
        user: req.user,
        profile,
        weapons: weaponStats,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ===== 智能提醒接口 =====
router.get('/alerts', authRequired, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 到期武器
    const expiringWeapons = await db.query(
      `SELECT weapon_name,
              CAST((julianday(expiry_time) - julianday(datetime('now', 'localtime'))) * 24 AS INTEGER) AS hours_left
       FROM weapons_inventory
       WHERE user_id = ? AND status = 'active' AND is_permanent = 0
         AND expiry_time IS NOT NULL AND expiry_time > datetime('now', 'localtime')
         AND expiry_time <= datetime('now', 'localtime', '+3 days')
       ORDER BY expiry_time ASC`,
      [userId]
    );

    // 待执行提醒
    const reminders = await db.query(
      `SELECT id, content, remind_at FROM reminders WHERE user_id = ? AND status = 'pending' ORDER BY remind_at ASC LIMIT 5`,
      [userId]
    );

    // 今日任务进度
    const taskProgress = await db.queryOne(
      `SELECT COUNT(*) as total, SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as done
       FROM daily_tasks WHERE user_id = ? AND task_date = date('now', 'localtime')`,
      [userId]
    );

    res.json({
      code: 0,
      data: {
        expiringWeapons,
        reminders,
        taskProgress: taskProgress || { total: 0, done: 0 },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ===== 快速录入战绩 =====
router.post('/match-record', authRequired, async (req, res, next) => {
  try {
    const { mode = '排位赛', map_name = '', result = 'win', kills = 0, deaths = 0, headshots = 0, assists = 0 } = req.body;

    await db.insert(
      `INSERT INTO match_records (user_id, match_date, mode, map_name, result, kills, deaths, assists, headshots, data_source)
       VALUES (?, date('now', 'localtime'), ?, ?, ?, ?, ?, ?, ?, 'api')`,
      [req.user.id, mode, map_name, result, kills, deaths, assists, headshots]
    );

    res.json({ code: 0, data: { message: '战绩录入成功' } });
  } catch (err) {
    next(err);
  }
});

// ===== 轮询未消费消息（Phase 2.5） =====
router.get('/pending-messages', authRequired, async (req, res, next) => {
  try {
    const messages = await db.query(
      `SELECT id, content, msg_type, chips, extra, created_at FROM pending_messages
       WHERE user_id = ? AND is_consumed = 0
       ORDER BY created_at ASC`,
      [req.user.id]
    );

    // 标记为已消费
    if (messages.length > 0) {
      const ids = messages.map(m => m.id);
      await db.query(
        `UPDATE pending_messages SET is_consumed = 1 WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
    }

    // 解析 JSON 字段
    const parsed = messages.map(m => ({
      ...m,
      chips: (() => { try { return JSON.parse(m.chips); } catch (_) { return []; } })(),
      extra: (() => { try { return JSON.parse(m.extra || '{}'); } catch (_) { return {}; } })(),
    }));

    res.json({ code: 0, data: { messages: parsed } });
  } catch (err) {
    next(err);
  }
});

// ===== Tool → Skill 映射 =====
// 用于判断某个 Tool 调用属于哪个技能，以便检查技能是否开启
const TOOL_SKILL_MAP = {
  check_expiring_weapons: 'weapon-guard',
  make_weapon_usage_plan: 'weapon-guard',
  set_weapon_reminder: 'weapon-guard',
  analyze_diamond_plan: 'diamond-advisor',
  get_weekly_report: 'battle-analyzer',
  record_match: 'battle-analyzer',
  compare_peers: 'battle-analyzer',
  get_rank_plan: 'battle-analyzer',
  get_daily_tasks: 'daily-task',
  complete_task: 'daily-task',
  query_weapon_wiki: 'weapon-wiki',
  query_weather: 'weather',
  // 提醒和画像是基础功能，不受技能开关控制
};

// 技能关闭时的引导话术（动态称呼）
function getSkillGuideMsg(skillId, callName) {
  const cn = callName || '主人';
  const msgs = {
    'weapon-guard': `${cn}～武器守护技能目前是关闭的哦 🔒\n\n开启后我就能帮你自动追踪限时武器到期、制定使用计划啦！\n\n👉 点击右上角「🧩 技能」→ 打开「限时武器守护」即可开启~`,
    'diamond-advisor': `${cn}～省钻大师技能目前是关闭的哦 💎🔒\n\n开启后我就能帮你智能分析充值性价比、规划省钻方案啦！\n\n👉 点击右上角「🧩 技能」→ 打开「省钻大师」即可开启~`,
    'battle-analyzer': `${cn}～战绩分析技能目前是关闭的哦 📊🔒\n\n开启后我就能帮你分析KD、爆头率、胜率，还有段位规划呢！\n\n👉 点击右上角「🧩 技能」→ 打开「战绩分析」即可开启~`,
    'daily-task': `${cn}～每日任务技能目前是关闭的哦 ✅🔒\n\n开启后我就能帮你管理每日任务、提醒待完成任务啦！\n\n👉 点击右上角「🧩 技能」→ 打开「每日任务提醒」即可开启~`,
    'weapon-wiki': `${cn}～枪械百科技能目前是关闭的哦 🔍🔒\n\n开启后我就能帮你一问即答查枪械数据、推荐配枪啦！\n\n👉 点击右上角「🧩 技能」→ 打开「枪械百科」即可开启~`,
    'weather': `${cn}～天气查询技能目前是关闭的哦 🌤️🔒\n\n开启后我就能帮你实时查天气、看预报、给穿搭建议啦！\n\n👉 点击右上角「🧩 技能」→ 打开「天气助手」即可开启~`,
  };
  return msgs[skillId] || `${cn}～这个功能对应的技能目前是关闭的哦 🔒\n\n👉 点击右上角「🧩 技能」开启即可~`;
}

/**
 * 获取用户技能开关状态
 */
function getSkillSettings(userId) {
  try {
    const row = db.queryOne('SELECT meta FROM user_profiles WHERE user_id = ?', [userId]);
    if (row && row.meta) {
      const meta = JSON.parse(row.meta);
      return meta.skillSettings || {};
    }
  } catch (_) {}
  return {}; // 默认全部开启
}

/**
 * 检查某个 Tool 对应的技能是否开启
 * 返回 null 表示开启，返回引导消息表示关闭
 */
function checkSkillEnabled(toolName, userId, callName) {
  const skillId = TOOL_SKILL_MAP[toolName];
  if (!skillId) return null; // 基础功能，不受开关控制

  const settings = getSkillSettings(userId);
  // 默认全开，只有显式设为 false 才算关闭
  if (settings[skillId] === false) {
    return getSkillGuideMsg(skillId, callName);
  }
  return null;
}

// ===== 技能开关设置 API =====
router.get('/skill-settings', authRequired, async (req, res, next) => {
  try {
    const settings = getSkillSettings(req.user.id);
    res.json({ code: 0, data: { settings } });
  } catch (err) {
    next(err);
  }
});

router.post('/skill-settings', authRequired, async (req, res, next) => {
  try {
    const { skillId, enabled } = req.body;
    if (!skillId) return res.status(400).json({ code: 400, message: 'skillId 必填' });

    // 读取现有 meta
    const row = db.queryOne('SELECT meta FROM user_profiles WHERE user_id = ?', [req.user.id]);
    let meta = {};
    try { meta = JSON.parse(row?.meta || '{}'); } catch (_) {}

    if (!meta.skillSettings) meta.skillSettings = {};
    meta.skillSettings[skillId] = !!enabled;

    await db.query(
      `UPDATE user_profiles SET meta = ?, updated_at = datetime('now', 'localtime') WHERE user_id = ?`,
      [JSON.stringify(meta), req.user.id]
    );

    res.json({ code: 0, data: { skillId, enabled: !!enabled } });
  } catch (err) {
    next(err);
  }
});

// ===== 游戏角色管理 =====
router.get('/game-role', authRequired, async (req, res, next) => {
  try {
    const row = db.queryOne('SELECT meta FROM user_profiles WHERE user_id = ?', [req.user.id]);
    let meta = {};
    try { meta = JSON.parse(row?.meta || '{}'); } catch (_) {}
    res.json({ code: 0, data: { gameRole: meta.gameRole || null } });
  } catch (err) {
    next(err);
  }
});

router.post('/game-role', authRequired, async (req, res, next) => {
  try {
    const { nickname, server, gameId } = req.body;
    if (!nickname) return res.status(400).json({ code: 400, message: '角色昵称必填' });

    // 读取现有 meta
    const row = db.queryOne('SELECT meta FROM user_profiles WHERE user_id = ?', [req.user.id]);
    let meta = {};
    try { meta = JSON.parse(row?.meta || '{}'); } catch (_) {}

    meta.gameRole = {
      nickname: nickname.trim(),
      server: (server || '').trim(),
      gameId: (gameId || '').trim(),
      updatedAt: new Date().toISOString(),
    };

    await db.query(
      `UPDATE user_profiles SET meta = ?, updated_at = datetime('now', 'localtime') WHERE user_id = ?`,
      [JSON.stringify(meta), req.user.id]
    );

    // 同时更新 call_name 为游戏昵称（如果用户没单独设过称呼）
    const profile = db.queryOne('SELECT call_name FROM user_profiles WHERE user_id = ?', [req.user.id]);
    if (!profile?.call_name || profile.call_name === '主人') {
      await db.query(
        `UPDATE user_profiles SET call_name = ? WHERE user_id = ?`,
        [nickname.trim(), req.user.id]
      );
    }

    res.json({ code: 0, data: { gameRole: meta.gameRole } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
