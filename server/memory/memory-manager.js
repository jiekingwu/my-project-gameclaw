/**
 * 记忆管理器
 * L1 即时记忆（会话）+ L2 短期记忆（日志）+ L3 长期记忆（画像）
 */
const db = require('../data/database');
const { v4: uuidv4 } = require('uuid');

class MemoryManager {
  /**
   * 加载用户完整上下文（Agent 决策前调用）
   */
  async loadContext(userId) {
    const [profile, session, recentLogs] = await Promise.all([
      this.getProfile(userId),
      this.getActiveSession(userId),
      this.getRecentLogs(userId, 2),
    ]);

    return {
      profile: profile || {},
      session,
      recentMessages: session?.messages || [],
      recentLogs,
    };
  }

  /**
   * L3: 获取玩家画像
   */
  async getProfile(userId) {
    return db.queryOne('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
  }

  /**
   * L1: 获取或创建活跃会话
   */
  async getActiveSession(userId) {
    let session = await db.queryOne(
      `SELECT * FROM chat_sessions
       WHERE user_id = ? AND last_active > datetime('now', '-30 minutes')
       ORDER BY last_active DESC LIMIT 1`,
      [userId]
    );

    if (session) {
      session.messages = JSON.parse(session.messages || '[]');
      return session;
    }

    const sessionId = uuidv4();
    await db.insert(
      'INSERT INTO chat_sessions (user_id, session_id, messages) VALUES (?, ?, ?)',
      [userId, sessionId, '[]']
    );

    return { session_id: sessionId, messages: [], user_id: userId };
  }

  /**
   * L1: 追加消息到会话
   */
  async appendToSession(userId, sessionId, message) {
    const session = await db.queryOne(
      'SELECT messages FROM chat_sessions WHERE session_id = ?',
      [sessionId]
    );

    const messages = JSON.parse(session?.messages || '[]');
    messages.push(message);
    const trimmed = messages.slice(-40); // 保留最近20轮

    await db.query(
      `UPDATE chat_sessions SET messages = ?, last_active = datetime('now', 'localtime') WHERE session_id = ?`,
      [JSON.stringify(trimmed), sessionId]
    );
  }

  /**
   * L2: 写入每日日志
   */
  async appendDailyLog(userId, { input, intentSkill, outputSummary }) {
    await db.insert(
      `INSERT INTO daily_logs (user_id, log_date, input_text, intent_skill, output_summary)
       VALUES (?, date('now', 'localtime'), ?, ?, ?)`,
      [userId, input.slice(0, 500), intentSkill || '', (outputSummary || '').slice(0, 200)]
    );
  }

  /**
   * L2: 获取最近N天的日志
   */
  async getRecentLogs(userId, days = 2) {
    return db.query(
      `SELECT input_text, intent_skill, output_summary, created_at
       FROM daily_logs
       WHERE user_id = ? AND log_date >= date('now', '-' || ? || ' days')
       ORDER BY created_at DESC LIMIT 20`,
      [userId, days]
    );
  }

  /**
   * L3: 更新画像字段
   */
  async updateProfile(userId, fields) {
    const setClauses = Object.keys(fields).map(k => `${k} = ?`);
    const values = Object.values(fields);
    if (setClauses.length === 0) return;

    await db.query(
      `UPDATE user_profiles SET ${setClauses.join(', ')} WHERE user_id = ?`,
      [...values, userId]
    );
  }

  /**
   * 记录记忆变更（审计追溯）
   */
  async logChange(userId, { field, oldValue, newValue, source, confidence }) {
    await db.insert(
      `INSERT INTO memory_changelog (user_id, field_path, old_value, new_value, source, confidence)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, field, String(oldValue ?? ''), String(newValue), source || 'manual', confidence || 1.0]
    );
  }
}

module.exports = new MemoryManager();
