/**
 * Skill 注册表 — Phase 2 升级
 * 所有 Skill 在这里注册，Gateway / Tool Executor 通过注册表路由到具体 Skill
 */
const WeaponManagerSkill = require('./weapon-manager');
const BattleAnalyzerSkill = require('./battle-analyzer');
const DiamondAdvisorSkill = require('./diamond-advisor');
const DailyTaskSkill = require('./daily-task');
const WeatherSkill = require('./weather');

const skillRegistry = {
  'weapon-manager': {
    description: '武器管理：到期检测、使用计划、武器仓库、到期提醒',
    handler: WeaponManagerSkill,
  },
  'battle-analyzer': {
    description: '战绩分析：KD分析、段位规划、同段对比、周报、战绩录入',
    handler: BattleAnalyzerSkill,
  },
  'diamond-advisor': {
    description: '钻石管家：省钻方案、充值建议、钻石预算、消费分析',
    handler: DiamondAdvisorSkill,
  },
  'daily-task': {
    description: '每日任务：任务清单、完成标记、任务执行向导',
    handler: DailyTaskSkill,
  },
  'weather': {
    description: '天气查询：实时天气、3天预报、穿搭建议、出行提醒',
    handler: WeatherSkill,
  },
};

function getSkillHandler(skillName) {
  const entry = skillRegistry[skillName];
  return entry ? entry.handler : null;
}

module.exports = { skillRegistry, getSkillHandler };
