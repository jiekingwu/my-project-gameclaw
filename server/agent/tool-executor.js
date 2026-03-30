/**
 * Tool 执行器（Phase 2.5）
 * LLM 决定调用哪个 Tool 后，这里负责实际执行并返回结构化结果
 */
const db = require('../data/database');
const { getSkillHandler } = require('../skills/registry');
const memoryManager = require('../memory/memory-manager');

class ToolExecutor {
  /**
   * 执行一个 Tool 调用
   * @param {string} toolName - Tool 名称
   * @param {object} args - Tool 参数
   * @param {object} context - { user, profile }
   * @returns {object} { success, data, summary }
   */
  static async execute(toolName, args, context) {
    const { user, profile } = context;

    try {
      switch (toolName) {
        // ===== 提醒 =====
        case 'set_reminder':
          return await ToolExecutor.setReminder(user, args);
        case 'list_reminders':
          return await ToolExecutor.listReminders(user);
        case 'delete_reminder':
          return await ToolExecutor.deleteReminder(user, args);

        // ===== 武器管理 =====
        case 'check_expiring_weapons':
          return await ToolExecutor.callSkill('weapon-manager', 'check_expiry', user, profile);
        case 'make_weapon_usage_plan':
          return await ToolExecutor.callSkill('weapon-manager', 'usage_plan', user, profile);
        case 'set_weapon_reminder':
          return await ToolExecutor.callSkill('weapon-manager', 'set_reminder', user, profile);

        // ===== 战绩 =====
        case 'get_weekly_report':
          return await ToolExecutor.callSkill('battle-analyzer', 'weekly_report', user, profile);
        case 'record_match':
          return await ToolExecutor.recordMatch(user, args);
        case 'compare_peers':
          return await ToolExecutor.callSkill('battle-analyzer', 'compare_peers', user, profile);
        case 'get_rank_plan':
          return await ToolExecutor.callSkill('battle-analyzer', 'rank_plan', user, profile);

        // ===== 钻石 =====
        case 'analyze_diamond_plan':
          return await ToolExecutor.callSkill('diamond-advisor', args.action || 'analyze', user, profile);

        // ===== 任务 =====
        case 'get_daily_tasks':
          return await ToolExecutor.callSkill('daily-task', 'list', user, profile);
        case 'complete_task':
          return await ToolExecutor.callSkill('daily-task', 'complete', user, profile, args);

        // ===== 百科 =====
        case 'query_weapon_wiki':
          return await ToolExecutor.queryWeaponWiki(args);

        // ===== 画像 =====
        case 'get_player_profile':
          return await ToolExecutor.getPlayerProfile(user);

        // ===== 天气 =====
        case 'query_weather': {
          // 如果 LLM 没传 city，从画像 meta.city 取
          let meta = {};
          try { meta = JSON.parse(profile?.meta || '{}'); } catch (_) {}
          if (!args.city && meta.city) {
            args.city = meta.city;
          }
          return await ToolExecutor.callSkill('weather', 'query', user, profile, args);
        }

        default:
          return { success: false, summary: `未知工具: ${toolName}` };
      }
    } catch (err) {
      console.error(`[ToolExecutor] ${toolName} 执行失败:`, err.message);
      return { success: false, summary: `执行 ${toolName} 时出错: ${err.message}` };
    }
  }

  // ===== 通用 Skill 调用 =====
  static async callSkill(skillName, action, user, profile, params = {}) {
    const handler = getSkillHandler(skillName);
    if (!handler) return { success: false, summary: `Skill ${skillName} 未注册` };

    const result = await handler.execute({ user, action, params, profile });
    return {
      success: true,
      data: result.data || null,
      reply: result.reply,
      chips: result.chips,
      summary: result.reply?.slice(0, 200),
    };
  }

  // ===== 提醒相关 =====
  static async setReminder(user, { content, remind_at }) {
    // 统一时间格式为北京时间
    const { normalizeToBeijing } = require('../utils/time');
    const normalizedTime = normalizeToBeijing(remind_at);

    console.log(`[SetReminder] 原始时间: ${remind_at} → 北京时间: ${normalizedTime}`);

    const id = await db.insert(
      `INSERT INTO reminders (user_id, content, remind_at, status) VALUES (?, ?, ?, 'pending')`,
      [user.id, content, normalizedTime]
    );

    // 构造系统日历事件数据（供前端 wx.addPhoneCalendar 使用）
    // normalizedTime 格式: "2026-03-29 12:00:00" 或 "2026-03-29T12:00:00"
    const startTime = normalizedTime.replace(' ', 'T').replace(/\.\d+Z?$/, '');
    // 默认提醒事件持续30分钟
    const startDate = new Date(startTime + '+08:00');
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
    const endTime = endDate.toISOString().replace('Z', '').slice(0, 19);

    return {
      success: true,
      summary: `已设置提醒: "${content}"，将在 ${normalizedTime} 触发。可以同步到手机系统日历，到时候手机也会弹通知提醒。`,
      data: {
        id,
        content,
        remind_at: normalizedTime,
        calendarEvent: {
          title: `[ZhijiClaw] ${content}`,
          startTime,
          endTime,
          description: `ZhijiClaw 提醒：${content}`,
          alarm: 5,  // 提前5分钟提醒
        },
      },
    };
  }

  static async listReminders(user) {
    // 查询所有提醒（pending + fired），不包括 cancelled
    const reminders = await db.query(
      `SELECT id, content, remind_at, status FROM reminders WHERE user_id = ? AND status IN ('pending', 'fired') ORDER BY remind_at DESC`,
      [user.id]
    );

    if (reminders.length === 0) {
      return { success: true, summary: '当前没有设置过任何提醒', data: { reminders: [] } };
    }

    const pendingCount = reminders.filter(r => r.status === 'pending').length;
    const firedCount = reminders.filter(r => r.status === 'fired').length;

    const lines = reminders.map((r, i) => {
      const statusEmoji = r.status === 'pending' ? '⏳' : '✅';
      const statusText = r.status === 'pending' ? '待触发' : '已提醒';
      return `${i + 1}. ${statusEmoji} [${statusText}] ${r.content} — ${r.remind_at}`;
    });

    return {
      success: true,
      summary: `共 ${reminders.length} 个提醒（⏳待触发 ${pendingCount} · ✅已提醒 ${firedCount}）:\n${lines.join('\n')}`,
      data: { reminders, pendingCount, firedCount },
    };
  }

  static async deleteReminder(user, { reminder_id }) {
    await db.query(
      `UPDATE reminders SET status = 'cancelled' WHERE id = ? AND user_id = ?`,
      [reminder_id, user.id]
    );
    return { success: true, summary: `已取消提醒 #${reminder_id}` };
  }

  // ===== 战绩录入 =====
  static async recordMatch(user, args) {
    const {
      mode = '排位赛',
      map_name = '',
      result = 'win',
      kills = 0,
      deaths = 0,
      headshots = 0,
    } = args;

    await db.insert(
      `INSERT INTO match_records (user_id, match_date, mode, map_name, result, kills, deaths, headshots, data_source)
       VALUES (?, date('now', 'localtime'), ?, ?, ?, ?, ?, ?, 'chat')`,
      [user.id, mode, map_name, result, kills, deaths, headshots]
    );

    const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills;
    return {
      success: true,
      summary: `战绩已录入: ${mode} ${result === 'win' ? '胜利' : '失败'} ${kills}杀${deaths}死 KD=${kd}`,
      data: { mode, result, kills, deaths, kd },
    };
  }

  // ===== 百科查询 =====
  static async queryWeaponWiki({ weapon_name }) {
    const weapon = await db.queryOne(
      `SELECT * FROM weapons_wiki WHERE name LIKE ?`,
      [`%${weapon_name}%`]
    );

    if (!weapon) {
      return { success: true, summary: `未找到 "${weapon_name}" 的百科数据` };
    }

    return {
      success: true,
      summary: `${weapon.name} (${weapon.tier}): 伤害${weapon.damage} 精准${weapon.accuracy} 射速${weapon.fire_rate} 后坐力${weapon.recoil}。${weapon.tips || ''}`,
      data: weapon,
    };
  }

  // ===== 玩家画像 =====
  static async getPlayerProfile(user) {
    const context = await memoryManager.loadContext(user.id);
    const profile = context.profile || {};

    const weapons = await db.query(
      `SELECT weapon_name, is_permanent, expiry_time,
              CAST((julianday(expiry_time) - julianday(datetime('now', 'localtime'))) * 24 AS INTEGER) AS hours_left
       FROM weapons_inventory WHERE user_id = ? AND status = 'active'`,
      [user.id]
    );

    return {
      success: true,
      summary: `段位:${profile.current_rank || '未知'} KD:${profile.latest_kd || '?'} 胜率:${profile.win_rate || '?'}% 钻石:${profile.total_diamonds || 0} 武器:${weapons.length}件`,
      data: { profile, weapons },
    };
  }
}

module.exports = ToolExecutor;
