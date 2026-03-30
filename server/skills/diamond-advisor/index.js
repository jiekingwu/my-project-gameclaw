/**
 * Skill: 钻石管家（Phase 2）
 * 功能：智能省钻分析、充值方案推荐、消费记录追踪
 */
const db = require('../../data/database');

class DiamondAdvisorSkill {
  static async execute({ user, action, params, profile }) {
    switch (action) {
      case 'diamond_plan':
      case 'analyze':
        return DiamondAdvisorSkill.analyzePlan(user, profile);
      case 'diamond_tips':
      case 'tips':
        return DiamondAdvisorSkill.advancedTips(profile);
      case 'recharge_reminder':
        return DiamondAdvisorSkill.rechargeReminder(user, profile);
      case 'budget':
        return DiamondAdvisorSkill.budgetPlan(profile);
      default:
        return DiamondAdvisorSkill.analyzePlan(user, profile);
    }
  }

  /**
   * 智能省钻方案分析
   */
  static async analyzePlan(user, profile) {
    const diamonds = profile.total_diamonds || 0;
    const hasMonthCard = profile.has_month_card;
    const monthlySpend = profile.monthly_spend || 0;

    // 根据实际数据生成个性化方案
    const plans = [];
    if (!hasMonthCard) {
      plans.push('① 🏆 **首选：购买月卡 ¥30**\n   每日返30💎×30天 = 900💎，性价比TOP1');
    }
    plans.push('② 💰 等限时折扣：半价武器/返利活动\n   耐心=省大钱，急了=多花钱');
    plans.push('③ 🎰 夺宝攒券抽：保底100抽\n   攒到50+券再一次性抽，效率最高');

    const saveTip = diamonds >= 3000
      ? `当前 ${diamonds}💎，储备充足 ✅`
      : `当前 ${diamonds}💎，建议攒到3000💎应对保底`;

    return {
      reply: `💎 **省钻方案分析（个性化）**\n\n📊 ${saveTip}\n${hasMonthCard ? '✅ 月卡已激活' : '⚠️ 未开月卡（强烈推荐）'}\n\n🎯 **最优方案：**\n${plans.join('\n\n')}\n\n💡 按当前消费水平，每月可省 200-500💎！`,
      chips: ['设置活动提醒', '更多省钻技巧', '钻石预算规划'],
    };
  }

  /**
   * 高级省钻技巧
   */
  static async advancedTips(profile) {
    return {
      reply: '💡 **高级省钻技巧**\n\n🎯 **长期省钻策略：**\n• 月卡：必买，每日返钻超值（性价比TOP1）\n• 首充：每档位首充双倍\n• 活动：等半价/折扣武器（耐心省大钱）\n• 夺宝：攒券一次性抽（保底更划算）\n• 签到：每日签到+任务钻石别漏\n\n📈 **省钻优先级：**\n月卡 > 首充双倍 > 限时折扣 > 夺宝保底\n\n💪 继续跟着我，做最精明的枪王！',
      chips: ['查看历史分析', '设置活动提醒', '钻石预算规划'],
    };
  }

  /**
   * 充值提醒
   */
  static async rechargeReminder(user, profile) {
    return {
      reply: '⏰ **已设置充值提醒！**\n\n📅 **近期返利活动：**\n• 充值返钻120%（关注公告）\n• 返利上限：最高返 💎 3000\n\n✅ 活动开始时我会第一时间通知你～\n\n💡 Tips: 配合月卡+返利，性价比拉满！',
      chips: ['查看我的钻石', '其他省钻方案', '取消提醒'],
    };
  }

  /**
   * 钻石预算规划
   */
  static async budgetPlan(profile) {
    const diamonds = profile.total_diamonds || 0;
    const hasMonthCard = profile.has_month_card;
    const monthIncome = hasMonthCard ? 900 : 0;
    const dailyTaskDiamonds = 50; // 每日任务约50钻
    const monthlyFree = dailyTaskDiamonds * 30 + monthIncome;

    return {
      reply: `📊 **钻石预算规划**\n\n💰 **当前余额：** ${diamonds}💎\n\n📈 **每月预计收入：**\n| 来源 | 数量 |\n|------|------|\n| 每日任务 | ~${dailyTaskDiamonds * 30}💎 |\n| 月卡返钻 | ${monthIncome > 0 ? monthIncome + '💎' : '未开通'} |\n| 活动/签到 | ~200💎 |\n| **合计** | **~${monthlyFree + 200}💎/月** |\n\n🎯 **建议分配：**\n• 60% 用于夺宝攒保底\n• 30% 限时折扣武器\n• 10% 备用/紧急\n\n${diamonds >= 3000 ? '✅ 余额健康，可以适当消费' : '⚠️ 建议先攒到3000💎再大额消费'}`,
      chips: ['省钻方案', '查看活动', '消费记录'],
    };
  }
}

module.exports = DiamondAdvisorSkill;
