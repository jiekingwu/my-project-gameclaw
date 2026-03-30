/**
 * 记忆信号检测器 — Phase 2 升级版
 * 快速判断对话中是否包含需要记忆的新信息
 * 纯正则，零 LLM 成本
 * Phase 2: 新增 applySignals 自动写入画像
 */
const db = require('../data/database');
const fs = require('fs');
const path = require('path');

const SIGNAL_PATTERNS = {
  RANK_CHANGE:    [/升[到了](.+段|枪王|大师)/, /掉[到了]/, /现在是(.+)段/, /上(钻石|枪王|大师)/],
  KD_CHANGE:      [/kd[是到了\s:：]*(\d+\.?\d*)/i, /k\/d[是到了\s:：]*(\d+\.?\d*)/i],
  DIAMOND_CHANGE: [/钻石[有还剩]*(\d+)/, /(\d+)[颗个]?钻石/, /充了(\d+)/],
  NEW_WEAPON:     [/[抽买到得]了(.+武器|.+皮肤)/, /入手了/, /开出来/],
  PREFERENCE:     [/我(喜欢|爱|习惯)(用|玩|打)/, /我(不喜欢|讨厌|不爱)(用|玩|打)/],
  GOAL:           [/我(想|要|打算|准备)(冲|上|到)/, /目标是/],
  // 命名 & 记忆信号
  // ⚠️ 排除疑问句：用负向前瞻过滤"什么/啥/几/谁/哪/多少"
  NAME_SELF:      [/你叫(?!什么|啥|几|谁|哪|多少)([\w\u4e00-\u9fa5]{1,12}?)[吧呢啊哦嘛好]?$/, /以后叫你(?!什么|啥)([\w\u4e00-\u9fa5]{1,12}?)[吧呢啊哦嘛好]?$/, /你的名字.{0,4}(?:是|叫)([\w\u4e00-\u9fa5]{1,12}?)[吧呢啊哦嘛好]?$/, /改名叫([\w\u4e00-\u9fa5]{1,12}?)[吧呢啊哦嘛好]?$/, /就叫你([\w\u4e00-\u9fa5]{1,12}?)[吧呢啊哦嘛好]?$/],
  CALL_ME:        [/叫我(?!什么|啥)([\w\u4e00-\u9fa5]{1,12}?)[吧呢啊哦嘛好]?$/, /称呼我(?!什么|啥)([\w\u4e00-\u9fa5]{1,12}?)[吧呢啊哦嘛好]?$/, /以后喊我(?!什么|啥)([\w\u4e00-\u9fa5]{1,12}?)[吧呢啊哦嘛好]?$/],
  PLAYER_NOTE:    [/你要记住(.+)/, /帮我记一下(.+)/, /记住[：:，,]?(.+)/],
  // 城市/位置信号
  LOCATION:       [/我在(.{2,10}?)[吧呢啊哦嘛好]?$/, /我住在?(.{2,10}?)[吧呢啊哦嘛好]?$/, /坐标(.{2,10}?)[吧呢啊哦嘛好]?$/, /我是(.{2,8}?)的[吧呢啊哦嘛好]?$/, /在(.{2,8}?)这边[吧呢啊哦嘛好]?$/, /搬到(.{2,8}?)了?[吧呢啊哦嘛好]?$/, /来(.{2,8}?)了[吧呢啊哦嘛好]?$/, /去了(.{2,8}?)[吧呢啊哦嘛好]?$/, /到(.{2,8}?)了[吧呢啊哦嘛好]?$/],
};

const ALL_PATTERNS = Object.values(SIGNAL_PATTERNS).flat();

/**
 * 快速判断是否有任何信号（<1ms）
 */
function hasAnySignal(text) {
  return ALL_PATTERNS.some(p => p.test(text));
}

/**
 * 详细检测所有信号
 */
function detectSignals(text) {
  const signals = [];
  for (const [type, patterns] of Object.entries(SIGNAL_PATTERNS)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        signals.push({ type, match: match[0], captured: match.slice(1) });
        break;
      }
    }
  }
  return signals;
}

/**
 * Phase 2: 自动将信号写入画像
 */
async function applySignals(userId, signals) {
  if (!signals || signals.length === 0) return;

  const updates = {};
  for (const sig of signals) {
    switch (sig.type) {
      case 'RANK_CHANGE': {
        const rank = sig.captured[0];
        if (rank) updates.current_rank = rank;
        break;
      }
      case 'KD_CHANGE': {
        const kd = parseFloat(sig.captured[0]);
        if (!isNaN(kd)) updates.latest_kd = kd;
        break;
      }
      case 'DIAMOND_CHANGE': {
        const diamonds = parseInt(sig.captured[0]);
        if (!isNaN(diamonds)) updates.total_diamonds = diamonds;
        break;
      }
      case 'NEW_WEAPON': {
        console.log(`[Signal] 用户 ${userId} 获得新武器:`, sig.match);
        break;
      }
      case 'PREFERENCE': {
        // Phase 3: 需要 LLM 提取具体偏好
        break;
      }
      case 'GOAL': {
        // Phase 3: 同上
        break;
      }
      case 'NAME_SELF': {
        // 给助理起别名 → 更新 SOUL.md + meta + 刷新缓存
        const selfName = sig.captured[0]?.trim();
        if (selfName && selfName.length <= 10) {
          await updateMeta(userId, 'selfName', selfName);
          updateSoulName(selfName);
          console.log(`[Signal] 助理别名已更新: ${selfName} (SOUL.md + meta)`);
        }
        break;
      }
      case 'CALL_ME': {
        // 主人希望被怎么称呼（存到 call_name）
        const callName = sig.captured[0]?.trim();
        if (callName && callName.length <= 10) {
          updates.call_name = callName;
          console.log(`[Signal] 主人称呼已更新: ${callName}`);
        }
        break;
      }
      case 'PLAYER_NOTE': {
        // 杂项记忆（追加到 meta.playerNotes）
        const note = sig.captured[0]?.trim();
        if (note) {
          await appendNote(userId, note);
          console.log(`[Signal] 玩家备注已记录: ${note}`);
        }
        break;
      }
      case 'LOCATION': {
        // 用户说了自己在哪个城市 → 存 meta.city
        const city = sig.captured[0]?.trim();
        if (city && city.length >= 2 && city.length <= 10) {
          await updateMeta(userId, 'city', city);
          console.log(`[Signal] 用户城市已更新: ${city}`);
        }
        break;
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    const setClauses = Object.keys(updates).map(k => `${k} = ?`);
    const values = Object.values(updates);
    try {
      await db.query(
        `UPDATE user_profiles SET ${setClauses.join(', ')}, updated_at = datetime('now', 'localtime') WHERE user_id = ?`,
        [...values, userId]
      );
      console.log(`[Signal] 画像已更新 (user=${userId}):`, updates);
    } catch (err) {
      console.error('[Signal] 画像更新失败:', err.message);
    }
  }
}

module.exports = { hasAnySignal, detectSignals, applySignals, SIGNAL_PATTERNS };

/**
 * 更新 meta 中的某个字段
 */
async function updateMeta(userId, key, value) {
  try {
    const row = db.queryOne('SELECT meta FROM user_profiles WHERE user_id = ?', [userId]);
    let meta = {};
    try { meta = JSON.parse(row?.meta || '{}'); } catch (_) {}
    meta[key] = value;
    await db.query(
      `UPDATE user_profiles SET meta = ?, updated_at = datetime('now', 'localtime') WHERE user_id = ?`,
      [JSON.stringify(meta), userId]
    );
  } catch (err) {
    console.error('[Signal] updateMeta 失败:', err.message);
  }
}

/**
 * 追加玩家备注（最多保留最近 20 条）
 */
async function appendNote(userId, note) {
  try {
    const row = db.queryOne('SELECT meta FROM user_profiles WHERE user_id = ?', [userId]);
    let meta = {};
    try { meta = JSON.parse(row?.meta || '{}'); } catch (_) {}
    if (!Array.isArray(meta.playerNotes)) meta.playerNotes = [];
    meta.playerNotes.push({ text: note, time: new Date().toISOString() });
    // 只保留最近 20 条
    if (meta.playerNotes.length > 20) meta.playerNotes = meta.playerNotes.slice(-20);
    await db.query(
      `UPDATE user_profiles SET meta = ?, updated_at = datetime('now', 'localtime') WHERE user_id = ?`,
      [JSON.stringify(meta), userId]
    );
  } catch (err) {
    console.error('[Signal] appendNote 失败:', err.message);
  }
}

/**
 * 更新 SOUL.md 中的助理名字
 * 在"我是谁"段落里追加/更新别名，然后刷新 Soul 缓存
 */
function updateSoulName(newName) {
  try {
    const soulPath = path.join(__dirname, '..', 'soul', 'SOUL.md');
    let content = fs.readFileSync(soulPath, 'utf8');

    // 检查是否已有别名行
    const aliasRegex = /^主人给我起的小名：.+$/m;
    const aliasLine = `主人给我起的小名：**${newName}**（主人喜欢这样叫我，我也用这个名字自称）`;

    if (aliasRegex.test(content)) {
      // 已有 → 更新
      content = content.replace(aliasRegex, aliasLine);
    } else {
      // 没有 → 在"我是谁"段落末尾追加
      content = content.replace(
        /从那天起，我就决定一辈子守护主人的游戏时光。/,
        `从那天起，我就决定一辈子守护主人的游戏时光。\n${aliasLine}`
      );
    }

    fs.writeFileSync(soulPath, content, 'utf8');
    console.log(`[Soul] SOUL.md 已更新别名: ${newName}`);

    // 刷新 Soul 缓存
    try {
      const { reloadSoul } = require('../soul/loader');
      reloadSoul();
    } catch (_) {}
  } catch (err) {
    console.error('[Soul] 更新 SOUL.md 失败:', err.message);
  }
}
