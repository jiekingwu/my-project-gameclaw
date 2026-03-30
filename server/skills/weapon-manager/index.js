/**
 * Skill: 武器管理器
 * 功能：到期检测、使用计划生成、武器仓库查询
 */
const db = require('../../data/database');

class WeaponManagerSkill {
  static async execute({ user, action, params, profile }) {
    switch (action) {
      case 'check_expiry':
        return WeaponManagerSkill.checkExpiry(user);
      case 'usage_plan':
        return WeaponManagerSkill.usagePlan(user);
      case 'set_reminder':
        return WeaponManagerSkill.setReminder(user);
      case 'new_weapon_preview':
        return WeaponManagerSkill.newWeaponPreview();
      default:
        return WeaponManagerSkill.checkExpiry(user);
    }
  }

  /**
   * 检查即将到期的武器
   */
  static async checkExpiry(user) {
    const weapons = await db.query(
      `SELECT weapon_name, weapon_type, quality, expiry_time,
              CAST((julianday(expiry_time) - julianday(datetime('now', 'localtime'))) * 24 AS INTEGER) AS hours_left
       FROM weapons_inventory
       WHERE user_id = ? AND status = 'active' AND is_permanent = 0
         AND expiry_time IS NOT NULL
       ORDER BY expiry_time ASC`,
      [user.id]
    );

    if (weapons.length === 0) {
      return {
        reply: '✅ **武器仓库安全！**\n\n当前没有即将到期的限时武器，主人可以放心~ 🎮',
        chips: ['查看武器仓库', '省钻攻略', '每日任务'],
        data: { weapons: [] },
      };
    }

    const weaponLines = weapons.map(w => {
      const hours = w.hours_left;
      let status;
      if (hours <= 6) status = '🔴 紧急';
      else if (hours <= 24) status = '🔴 明天到期';
      else if (hours <= 72) status = '🟡 3天内';
      else status = '🟢 安全';

      const timeStr = hours <= 24 ? `${hours}小时后` : `${Math.ceil(hours / 24)}天后`;
      return `| ${w.weapon_name} | ${status} | ${timeStr} |`;
    });

    const urgentCount = weapons.filter(w => w.hours_left <= 24).length;

    return {
      reply: `🔫 **限时武器到期检查完毕！**\n\n| 名称 | 状态 | 时间 |\n|------|------|------|\n${weaponLines.join('\n')}\n\n${urgentCount > 0 ? `⚠️ **${urgentCount}件武器24小时内到期！** 建议今晚抓紧使用！` : '💡 暂时还不紧急，但记得提前安排~'}`,
      chips: ['制定使用计划', '查看活动模式', '设置到期提醒'],
      data: { weapons, urgentCount },
    };
  }

  /**
   * 生成使用计划
   */
  static async usagePlan(user) {
    const weapons = await db.query(
      `SELECT weapon_name, weapon_type, quality,
              CAST((julianday(expiry_time) - julianday(datetime('now', 'localtime'))) * 24 AS INTEGER) AS hours_left
       FROM weapons_inventory
       WHERE user_id = ? AND status = 'active' AND is_permanent = 0
         AND expiry_time IS NOT NULL AND expiry_time > datetime('now', 'localtime')
       ORDER BY expiry_time ASC LIMIT 5`,
      [user.id]
    );

    if (weapons.length === 0) {
      return {
        reply: '📋 当前没有需要使用的限时武器，主人先休息吧~ 😊',
        chips: ['查看武器仓库', '每日任务', '省钻攻略'],
      };
    }

    const modeMap = { rifle: '排位赛', sniper: '狙击模式', smg: '团队竞技', shotgun: '爆破模式' };
    const steps = weapons.map((w, i) => {
      const mode = modeMap[w.weapon_type] || '排位赛';
      return `| 步骤${i + 1} | 使用${w.weapon_name}打${mode} | ${w.hours_left}h内 |`;
    });

    return {
      reply: `📋 **限时武器最优使用计划**\n\n⏰ **今晚黄金时段 20:00-23:00**\n\n| 步骤 | 内容 | 截止 |\n|------|------|------|\n${steps.join('\n')}\n\n🎯 **使用建议：**\n• 先用最紧急的武器打排位\n• 截图留念，限时武器过期就没了！\n\n💡 加油主人，抓紧时间享受好枪！🔥`,
      chips: ['查看排位推荐地图', '狙击模式技巧', '设置到期提醒'],
      data: { weapons },
    };
  }

  /**
   * 设置提醒
   */
  static async setReminder(user) {
    const weapons = await db.query(
      `SELECT id, weapon_name,
              CAST((julianday(expiry_time) - julianday(datetime('now', 'localtime'))) * 24 AS INTEGER) AS hours_left
       FROM weapons_inventory
       WHERE user_id = ? AND status = 'active' AND is_permanent = 0
         AND expiry_time IS NOT NULL AND expiry_time > datetime('now', 'localtime')`,
      [user.id]
    );

    if (weapons.length > 0) {
      const ids = weapons.map(w => w.id);
      await db.query(
        `UPDATE weapons_inventory SET notified = 0 WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
    }

    return {
      reply: `⏰ **已设置智能提醒！**\n\n✅ **提醒规则已生效：**\n• 提前24小时提醒\n• 到期前2小时紧急提醒\n\n📊 **当前守护中武器：${weapons.length}件**\n${weapons.map(w => `• ${w.weapon_name} — ${w.hours_left}小时后到期`).join('\n')}`,
      chips: ['修改提醒时间', '查看守护记录', '关闭提醒'],
    };
  }

  /**
   * 新武器预览
   */
  static async newWeaponPreview() {
    return {
      reply: `🔫 **新武器预览：英雄级「炎魔-AK47」**\n\n• 品质：英雄级武器（顶级）\n• 属性：伤害+5 / 精准+3\n• 获取：限时夺宝（100抽保底）\n\n🔥 **特殊属性：**\n• 击杀特效：炎魔烈焰燃烧\n• 切枪加速 + 换弹加速\n\n竞技评分：S+\n💡 **建议：必入手！**`,
      chips: ['夺宝概率计算', '钻石够不够', '对比火麒麟'],
    };
  }
}

module.exports = WeaponManagerSkill;
