/**
 * Skill: 每日任务管理（Phase 2）
 * 功能：任务清单、完成标记、任务引导
 */
const db = require('../../data/database');

class DailyTaskSkill {
  static async execute({ user, action, params, profile }) {
    switch (action) {
      case 'list':
      case 'daily_tasks':
        return DailyTaskSkill.listTasks(user);
      case 'complete':
        return DailyTaskSkill.completeTask(user, params);
      case 'guide':
      case 'task_guide':
        return DailyTaskSkill.taskGuide(user);
      default:
        return DailyTaskSkill.listTasks(user);
    }
  }

  /**
   * 获取今日任务清单
   */
  static async listTasks(user) {
    // 确保今天的任务已初始化
    await DailyTaskSkill.ensureTodayTasks(user.id);

    const tasks = await db.query(
      `SELECT * FROM daily_tasks WHERE user_id = ? AND task_date = date('now', 'localtime') ORDER BY sort_order ASC`,
      [user.id]
    );

    const completed = tasks.filter(t => t.is_completed).length;
    const total = tasks.length;

    const lines = tasks.map(t => {
      const check = t.is_completed ? '✓' : '○';
      const strike = t.is_completed ? `~~${t.task_name}~~` : t.task_name;
      return `${check} ${strike} — ${t.reward_desc}`;
    });

    const totalDiamonds = tasks.reduce((s, t) => s + (t.reward_diamonds || 0), 0);
    const earnedDiamonds = tasks.filter(t => t.is_completed).reduce((s, t) => s + (t.reward_diamonds || 0), 0);

    return {
      reply: `✅ **今日任务清单**（${completed}/${total} 已完成）\n\n${lines.join('\n')}\n\n💎 已获得 ${earnedDiamonds}/${totalDiamonds} 钻石\n\n💡 ${completed === total ? '🎉 全部完成！真棒主人！' : '建议先用限时武器打排位，一举两得！'}`,
      chips: completed < total ? ['开始做任务', '查看到期武器', '排位配枪推荐'] : ['查看战绩', '省钻攻略', '明日任务预告'],
    };
  }

  /**
   * 完成某个任务
   */
  static async completeTask(user, params) {
    const { taskId, taskName } = params || {};

    if (taskId) {
      await db.query(
        `UPDATE daily_tasks SET is_completed = 1 WHERE id = ? AND user_id = ?`,
        [taskId, user.id]
      );
    } else if (taskName) {
      await db.query(
        `UPDATE daily_tasks SET is_completed = 1 WHERE user_id = ? AND task_date = date('now', 'localtime') AND task_name LIKE ?`,
        [user.id, `%${taskName}%`]
      );
    }

    return DailyTaskSkill.listTasks(user);
  }

  /**
   * 任务执行引导
   */
  static async taskGuide(user) {
    return {
      reply: '🎮 **每日任务执行向导**\n\n| 步骤 | 内容 | 预计时间 |\n|------|------|----------|\n| 第1步 | 签到+领取每日奖励 | 30秒 |\n| 第2步 | 团队竞技×3（击杀任务） | 20分钟 |\n| 第3步 | 排位赛×2（冲段+胜场） | 30分钟 |\n| 第4步 | 挑战模式×1（双倍积分） | 15分钟 |\n\n⏱️ 预计耗时：约65分钟\n💎 总奖励：钻石×50 + GP×8000\n\n💡 先打团竞热手，再上排位效果更好！',
      chips: ['排位配枪推荐', '挑战模式攻略', '设置完成提醒'],
    };
  }

  /**
   * 确保今天的任务已初始化
   */
  static async ensureTodayTasks(userId) {
    const existing = await db.queryOne(
      `SELECT COUNT(*) as cnt FROM daily_tasks WHERE user_id = ? AND task_date = date('now', 'localtime')`,
      [userId]
    );

    if (existing && existing.cnt > 0) return;

    // 初始化每日默认任务
    const defaultTasks = [
      { name: '每日签到', reward: '+20💎', diamonds: 20, sort: 1 },
      { name: '完成3场团队竞技', reward: '+GP 3000', diamonds: 0, sort: 2 },
      { name: '击杀50名敌人', reward: '+经验 1500', diamonds: 0, sort: 3 },
      { name: '赢得2场排位赛', reward: '排位积分×2', diamonds: 10, sort: 4 },
      { name: '挑战模式通关1次', reward: '🎁 双倍积分', diamonds: 10, sort: 5 },
      { name: '使用限时武器完成1场', reward: '+10💎', diamonds: 10, sort: 6 },
    ];

    for (const task of defaultTasks) {
      await db.insert(
        `INSERT INTO daily_tasks (user_id, task_date, task_name, reward_desc, reward_diamonds, sort_order) VALUES (?, date('now', 'localtime'), ?, ?, ?, ?)`,
        [userId, task.name, task.reward, task.diamonds, task.sort]
      );
    }
  }
}

module.exports = DailyTaskSkill;
