/**
 * 定时扫描器（Phase 2 + Phase 2.5）
 * 每10秒扫描一次：
 * 1. 武器即将到期提醒
 * 2. 用户设置的自定义提醒
 * 3. 提醒消息写入对话列表 (pending_messages)
 */
const db = require('../data/database');
const { sendReminder } = require('./subscribe-msg');
const { v4: uuidv4 } = require('uuid');

let timer = null;

/**
 * 启动定时扫描
 */
function start(intervalMs = 10000) {
  if (timer) return;
  console.log(`[Cron] 定时扫描已启动 (间隔 ${intervalMs / 1000}s)`);
  timer = setInterval(() => scan(), intervalMs);
  // 启动后延迟5秒执行首次扫描
  setTimeout(() => scan(), 5000);
}

/**
 * 停止定时扫描
 */
function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[Cron] 定时扫描已停止');
  }
}

/**
 * 主扫描逻辑
 */
async function scan() {
  try {
    await scanExpiringWeapons();
    await scanReminders();
  } catch (err) {
    console.error('[Cron] 扫描出错:', err.message);
  }
}

/**
 * 扫描即将到期的武器
 */
async function scanExpiringWeapons() {
  // 查找24小时内到期且未通知的武器
  const weapons = await db.query(
    `SELECT wi.id, wi.user_id, wi.weapon_name, wi.expiry_time,
            u.openid,
            CAST((julianday(wi.expiry_time) - julianday(datetime('now', 'localtime'))) * 24 AS INTEGER) AS hours_left
     FROM weapons_inventory wi
     JOIN users u ON u.id = wi.user_id
     WHERE wi.status = 'active'
       AND wi.is_permanent = 0
       AND wi.notified = 0
       AND wi.expiry_time IS NOT NULL
       AND wi.expiry_time <= datetime('now', 'localtime', '+24 hours')
       AND wi.expiry_time > datetime('now', 'localtime')`,
    []
  );

  for (const w of weapons) {
    console.log(`[Cron] 武器到期提醒: ${w.weapon_name} → user ${w.user_id} (${w.hours_left}h)`);

    // 尝试发送订阅消息
    await sendReminder(w.openid, {
      title: '武器到期提醒',
      content: `${w.weapon_name} ${w.hours_left}小时后到期`,
      time: w.expiry_time,
    });

    // 写入对话列表（从画像读称呼）
    let cn = '主人';
    try {
      const p = db.queryOne('SELECT call_name FROM user_profiles WHERE user_id = ?', [w.user_id]);
      if (p?.call_name) cn = p.call_name;
    } catch (_) {}
    await injectReminderMessage(w.user_id, {
      content: `⚠️ ${cn}注意！**${w.weapon_name}** 还有 ${w.hours_left} 小时就到期了！\n\n赶紧用它打几局排位，别浪费了好枪 🔫`,
      chips: ['查看所有到期武器', '制定使用计划', '我知道了'],
    });

    // 标记已通知
    await db.query('UPDATE weapons_inventory SET notified = 1 WHERE id = ?', [w.id]);
  }
}

/**
 * 扫描用户设置的提醒
 * 兼容两种时间格式：
 * - SQLite 格式: "2026-03-28 08:15:09"
 * - ISO 8601 格式: "2026-03-28T08:15:09.281Z"
 * 使用 replace() 统一为 SQLite 格式后再比较
 */
async function scanReminders() {
  const { nowBeijing } = require('../utils/time');
  const now = nowBeijing();
  
  const reminders = await db.query(
    `SELECT r.id, r.user_id, r.content, r.remind_at, u.openid
     FROM reminders r
     JOIN users u ON u.id = r.user_id
     WHERE r.status = 'pending'
       AND replace(replace(r.remind_at, 'T', ' '), 'Z', '') <= ?`,
    [now]
  );

  for (const r of reminders) {
    console.log(`[Cron] 触发提醒: "${r.content}" → user ${r.user_id}`);

    // 尝试发送订阅消息
    await sendReminder(r.openid, {
      title: '自定义提醒',
      content: r.content,
      time: r.remind_at,
    });

    // 写入对话列表（提醒到期通知，不含日历引导）
    await injectReminderMessage(r.user_id, {
      content: `⏰ **提醒时间到！**\n\n${r.content}\n\n📅 设定时间：${r.remind_at}`,
      chips: ['好的收到', '再提醒我一次', '查看所有提醒'],
    });

    // 标记已触发
    await db.query(`UPDATE reminders SET status = 'fired' WHERE id = ?`, [r.id]);
  }
}

/**
 * 注入提醒消息到对话列表 + pending_messages
 */
async function injectReminderMessage(userId, { content, chips, extra }) {
  try {
    const session = await db.queryOne(
      `SELECT session_id, messages FROM chat_sessions WHERE user_id = ? ORDER BY last_active DESC LIMIT 1`,
      [userId]
    );
    if (session) {
      const messages = JSON.parse(session.messages || '[]');
      messages.push({ role: 'assistant', content, timestamp: Date.now(), type: 'reminder' });
      const trimmed = messages.slice(-40);
      await db.query(
        `UPDATE chat_sessions SET messages = ?, last_active = datetime('now', 'localtime') WHERE session_id = ?`,
        [JSON.stringify(trimmed), session.session_id]
      );
    }

    // 兼容旧数据库：确保 extra 列存在
    try { db.query("SELECT extra FROM pending_messages LIMIT 0"); } catch (_) {
      try { db.query("ALTER TABLE pending_messages ADD COLUMN extra TEXT DEFAULT '{}'"); } catch (__) {}
    }

    await db.insert(
      `INSERT INTO pending_messages (user_id, content, msg_type, chips, extra) VALUES (?, ?, 'reminder', ?, ?)`,
      [userId, content, JSON.stringify(chips || []), JSON.stringify(extra || {})]
    );
    console.log(`[Cron] 消息已注入对话列表 → user ${userId}`);
  } catch (err) {
    console.error('[Cron] 注入消息失败:', err.message);
  }
}

module.exports = { start, stop, scan, injectReminderMessage };
