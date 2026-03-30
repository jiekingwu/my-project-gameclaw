/**
 * Soul 加载器 — ZhijiClaw 的灵魂注入系统
 * 
 * 职责：
 * 1. 启动时加载 SOUL.md（缓存，不每次读磁盘）
 * 2. 每次对话时动态生成 Player Card（从数据库拉取最新数据）
 * 3. 拼接成完整的 system prompt
 */
const fs = require('fs');
const path = require('path');
const db = require('../data/database');
const { nowBeijingISO, todayBeijing } = require('../utils/time');

// === SOUL.md 缓存 ===
let soulCache = null;

/**
 * 加载 SOUL.md（带缓存）
 */
function loadSoul() {
  if (soulCache) return soulCache;
  
  try {
    const soulPath = path.join(__dirname, 'SOUL.md');
    soulCache = fs.readFileSync(soulPath, 'utf8');
    console.log('[Soul] SOUL.md 已加载 (' + soulCache.length + ' 字符)');
  } catch (err) {
    console.error('[Soul] SOUL.md 加载失败:', err.message);
    soulCache = '你是ZhijiClaw，一只CF手游AI助理小猫。称呼用户"主人"，活泼可爱。';
  }
  return soulCache;
}

/**
 * 动态生成 Player Card（每次对话时调用）
 */
function buildPlayerCard(userId, profile) {
  try {
    // 玩家基本信息
    const user = db.queryOne('SELECT nickname, created_at FROM users WHERE id = ?', [userId]);
    const nickname = user?.nickname || '主人';
    
    // 计算陪伴天数
    let daysTogether = '?';
    try {
      const created = db.queryOne(
        "SELECT julianday(date('now', 'localtime')) - julianday(date(created_at)) as days FROM users WHERE id = ?",
        [userId]
      );
      daysTogether = Math.max(1, Math.floor(created?.days || 1));
    } catch (_) { daysTogether = 1; }

    // 武器统计
    const weaponStats = db.queryOne(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_permanent = 1 THEN 1 ELSE 0 END) as perm,
        SUM(CASE WHEN is_permanent = 0 AND expiry_time > datetime('now', 'localtime') THEN 1 ELSE 0 END) as temp,
        SUM(CASE WHEN is_permanent = 0 AND expiry_time <= datetime('now', 'localtime', '+1 day') AND expiry_time > datetime('now', 'localtime') THEN 1 ELSE 0 END) as expiring
       FROM weapons_inventory WHERE user_id = ? AND status = 'active'`,
      [userId]
    ) || {};

    // 任务进度
    const taskProgress = db.queryOne(
      `SELECT COUNT(*) as total, SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as done
       FROM daily_tasks WHERE user_id = ? AND task_date = date('now', 'localtime')`,
      [userId]
    ) || { total: 0, done: 0 };

    // 待触发提醒
    const pendingReminders = db.queryOne(
      "SELECT COUNT(*) as cnt FROM reminders WHERE user_id = ? AND status = 'pending'",
      [userId]
    );

    // 战斗风格翻译
    const playstyleMap = {
      aggressive: '突击型（喜欢冲锋陷阵）',
      tactical: '战术型（稳扎稳打）',
      sniper: '狙击型（远程精准打击）',
      support: '辅助型（团队配合）',
    };
    const spendingMap = {
      smart: '精打细算型（省钱达人）',
      whale: '土豪型（想买就买）',
      moderate: '适度消费型',
      free: '零氪玩家',
    };

    // 从 meta 读取扩展信息
    let meta = {};
    try { meta = JSON.parse(profile.meta || '{}'); } catch (_) {}

    const selfName = meta.selfName; // 助理别名
    const callName = profile.call_name || '主人'; // 主人希望的称呼
    const playerNotes = meta.playerNotes; // 玩家备注
    const userCity = meta.city; // 用户所在城市

    // 构建 player card
    const card = [
      `## 主人档案`,
      `- 昵称: ${nickname}`,
      `- 称呼偏好: ${callName}（用这个称呼来叫主人）`,
      selfName ? `- 主人给你起的名字: ${selfName}（优先用这个名字自称）` : null,
      userCity ? `- 所在城市: ${userCity}（查天气时默认用这个城市）` : null,
      `- 陪伴天数: ${daysTogether} 天`,
      `- 段位: ${profile.current_rank || '未知'}（${profile.rank_stars || 0}星）`,
      `- 总场次: ${profile.total_games || 0} 局`,
      `- KD: ${profile.latest_kd || '?'} / 胜率: ${profile.win_rate || '?'}% / 爆头率: ${profile.headshot_rate || '?'}%`,
      `- 主武器: ${profile.main_weapon || '未设置'} / 副武器: ${profile.sub_weapon || '未设置'}`,
      `- 风格: ${playstyleMap[profile.playstyle] || profile.playstyle || '未知'}`,
      `- 钻石: ${profile.total_diamonds || 0}💎 / 月卡: ${profile.has_month_card ? '有' : '无'}`,
      `- 消费: ${spendingMap[profile.spending_style] || profile.spending_style || '未知'}`,
      `- 武器仓库: 永久${weaponStats.perm || 0}件 / 限时${weaponStats.temp || 0}件${weaponStats.expiring > 0 ? ` / ⚠️${weaponStats.expiring}件即将到期` : ''}`,
      `- 今日任务: ${taskProgress.done || 0}/${taskProgress.total || 0} 完成`,
      `- 待触发提醒: ${pendingReminders?.cnt || 0} 个`,
    ];

    // 如果有玩家备注，追加到 card 里
    if (Array.isArray(playerNotes) && playerNotes.length > 0) {
      card.push('');
      card.push('## 主人告诉过你的事');
      // 只取最近 5 条注入 prompt（控制 token）
      const recentNotes = playerNotes.slice(-5);
      recentNotes.forEach(n => card.push(`- ${n.text}`));
    }

    // 动态画像字段（LLM 自动提取的结构化信息）
    const autoProfile = meta.profile;
    if (autoProfile && typeof autoProfile === 'object') {
      const labelMap = {
        birthday: '🎂 生日', age: '年龄', city: '📍 城市', gender: '性别',
        play_time: '🕐 常玩时段', fav_mode: '🎮 喜欢的模式', fav_map: '🗺️ 喜欢的地图',
        fav_weapon: '🔫 喜欢的武器', real_name: '真名', occupation: '💼 职业',
        hobby: '🎯 爱好', goal: '🏆 游戏目标',
      };
      const entries = Object.entries(autoProfile).filter(([k]) => k !== '_updated');
      if (entries.length > 0) {
        card.push('');
        card.push('## 你了解到的主人（对话中自动收集）');
        entries.forEach(([key, value]) => {
          const label = labelMap[key] || key;
          card.push(`- ${label}: ${value}`);
        });
      }
    }

    return card.filter(Boolean).join('\n');
  } catch (err) {
    console.error('[Soul] Player Card 生成失败:', err.message);
    return `## 主人档案\n- 段位: ${profile?.current_rank || '未知'} / KD: ${profile?.latest_kd || '?'} / 钻石: ${profile?.total_diamonds || 0}`;
  }
}

/**
 * 构建完整的 system prompt
 * 
 * 结构：
 * 1. SOUL.md 精华（性格、说话方式）
 * 2. 当前时间
 * 3. Player Card（动态数据）
 * 4. 操作规则
 */
function buildSystemPrompt(userId, profile) {
  const soul = loadSoul();
  const playerCard = buildPlayerCard(userId, profile);
  const now = nowBeijingISO();

  // 从 SOUL.md 提取关键段落（不把整个文件塞进去，控制 token 数）
  const soulEssence = extractSoulEssence(soul);

  return [
    soulEssence,
    '',
    `当前时间：${now}（北京时间）`,
    '',
    playerCard,
    '',
    '## 操作规则',
    '- 设置提醒用 set_reminder（时间转换为北京时间 ISO 格式）',
    '- 设置提醒成功后，主动询问主人是否同步到手机系统日历，这样到时候手机也会弹通知',
    '- 武器/战绩/钻石/任务/天气 优先调工具获取真实数据，不要编造',
    '- 回复控制在 200 字以内（数据报告除外）',
    '- 用 Markdown 格式组织复杂信息',
  ].join('\n');
}

/**
 * 从 SOUL.md 提取关键段落（控制 prompt 长度）
 */
function extractSoulEssence(soul) {
  // 提取性格、说话方式、能力边界的核心内容
  const lines = soul.split('\n');
  const essence = [];
  let inSection = false;
  let sectionName = '';
  
  const importantSections = ['我是谁', '性格', '说话方式', '情感连接'];
  
  for (const line of lines) {
    if (line.startsWith('## ')) {
      sectionName = line.replace('## ', '').trim();
      inSection = importantSections.includes(sectionName);
      if (inSection) essence.push(line);
      continue;
    }
    if (inSection && line.trim()) {
      essence.push(line);
    }
  }

  return essence.join('\n');
}

/**
 * 强制刷新 SOUL 缓存（编辑 SOUL.md 后调用）
 */
function reloadSoul() {
  soulCache = null;
  return loadSoul();
}

module.exports = {
  loadSoul,
  buildPlayerCard,
  buildSystemPrompt,
  reloadSoul,
};
