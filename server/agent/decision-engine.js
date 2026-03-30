/**
 * ⚠️ [已废弃] Phase 1 混合决策引擎
 *
 * Phase 2.5 已被 gateway.js + LLM Function Calling 完全替代。
 * 保留此文件仅供架构参考，不再被任何模块引用。
 *
 * 原决策流程：
 * 1. 规则引擎快速匹配（零成本，<1ms）
 * 2. 未命中 → LLM 意图识别 + Tool Calling（~1-2s）
 * 3. 路由到对应 Skill 执行
 *
 * 替代方案：gateway.js 中的 needTools 正则 + LLM Function Calling
 */
const llm = require('./llm-client');
const { skillRegistry } = require('../skills/registry');

// ===== 对话规则表 =====
const DIALOG_RULES = [
  // 武器管理类
  { priority: 10, keywords: ['制定使用计划', '使用计划'], skill: 'weapon-manager', action: 'usage_plan' },
  { priority: 10, keywords: ['设置到期提醒', '到期提醒'], skill: 'weapon-manager', action: 'set_reminder' },
  { priority: 20, keywords: ['过期', '道具', '到期', '武器快'], skill: 'weapon-manager', action: 'check_expiry' },
  { priority: 10, keywords: ['查看新武器', '新武器'], skill: 'weapon-manager', action: 'new_weapon_preview' },
  // 战绩分析类
  { priority: 10, keywords: ['详细枪械', '枪械分析', '详细装备', '装备分析'], skill: 'battle-analyzer', action: 'weapon_stats' },
  { priority: 10, keywords: ['对比同段', '同级玩家', '对比同级'], skill: 'battle-analyzer', action: 'compare_peers' },
  { priority: 30, keywords: ['战力', '战绩', '分析'], skill: 'battle-analyzer', action: 'weekly_report' },
  { priority: 20, keywords: ['成长', '规划', '段位', '培养'], skill: 'battle-analyzer', action: 'rank_plan' },
  { priority: 10, keywords: ['开始执行计划', '执行计划'], skill: 'battle-analyzer', action: 'execute_plan' },
  // 钻石/消费类（Phase 2 实现）
  { priority: 10, keywords: ['更多省钻', '省钻技巧', '更多省钱'], skill: '_static', action: 'diamond_tips' },
  { priority: 20, keywords: ['省钱', '充值', '省钻'], skill: '_static', action: 'diamond_plan' },
  { priority: 10, keywords: ['提醒充值', '充值返利'], skill: '_static', action: 'recharge_reminder' },
  // 任务类
  { priority: 10, keywords: ['开始做任务', '开始任务'], skill: '_static', action: 'task_guide' },
  { priority: 20, keywords: ['任务', '今日', '待完成', '每日'], skill: '_static', action: 'daily_tasks' },
  // 百科查询类
  { priority: 10, keywords: ['查枪械', '枪械数据', '查角色'], skill: '_static', action: 'wiki_search' },
  { priority: 15, keywords: ['ak47', '压枪'], skill: '_static', action: 'wiki_ak47' },
  { priority: 15, keywords: ['m4a1'], skill: '_static', action: 'wiki_m4a1' },
  { priority: 15, keywords: ['awm'], skill: '_static', action: 'wiki_awm' },
  // 配枪推荐
  { priority: 10, keywords: ['配枪推荐', '排位配枪', '装备推荐', '装备搭配'], skill: '_static', action: 'loadout_recommend' },
  { priority: 20, keywords: ['阵容', '搭配', '配枪'], skill: '_static', action: 'loadout_by_map' },
  // 福利/活动
  { priority: 20, keywords: ['福利', '兑换'], skill: '_static', action: 'welfare' },
  { priority: 10, keywords: ['复制兑换码', '兑换码'], skill: '_static', action: 'redeem_code' },
  { priority: 20, keywords: ['版本', '更新', '前瞻'], skill: '_static', action: 'version_preview' },
  { priority: 10, keywords: ['抽卡模拟', '夺宝概率'], skill: '_static', action: 'gacha_sim' },
  // 情感/通用
  { priority: 10, keywords: ['谢谢', '感谢'], skill: '_static', action: 'thanks' },
  { priority: 10, keywords: ['晚安'], skill: '_static', action: 'goodnight' },
  { priority: 20, keywords: ['回到主页', '主页'], skill: '_static', action: 'home' },
  { priority: 10, keywords: ['玩了多久', '疲劳', '健康'], skill: '_static', action: 'health' },
];

DIALOG_RULES.sort((a, b) => a.priority - b.priority);

class DecisionEngine {
  constructor() {
    this.rules = DIALOG_RULES;
  }

  /**
   * 主决策入口
   */
  async resolve(userText, context) {
    // 第一层：规则引擎快速匹配
    const ruleMatch = this.matchRule(userText);
    if (ruleMatch) {
      return { source: 'rule', skill: ruleMatch.skill, action: ruleMatch.action };
    }

    // 第二层：LLM 意图识别
    try {
      const llmResult = await this.llmResolve(userText, context);
      return { source: 'llm', ...llmResult };
    } catch (err) {
      console.error('[DecisionEngine] LLM fallback 失败:', err.message);
      return { source: 'fallback', skill: '_general', action: 'default' };
    }
  }

  matchRule(userText) {
    const lower = userText.toLowerCase();
    for (const rule of this.rules) {
      if (rule.keywords.some(kw => lower.includes(kw))) {
        return rule;
      }
    }
    return null;
  }

  async llmResolve(userText, context) {
    const profile = context.profile || {};
    const systemPrompt = `你是 ZhijiClaw 的意图路由器。根据用户输入，判断应该调用哪个技能。

当前玩家数据：
- 段位：${profile.current_rank || '未知'} ${profile.rank_stars || 0}星
- KD：${profile.latest_kd || '未知'}
- 爆头率：${profile.headshot_rate || '未知'}%
- 钻石：${profile.total_diamonds || 0}

可用技能列表：
${Object.entries(skillRegistry).map(([k, v]) => `- ${k}: ${v.description}`).join('\n')}
- _general: 通用对话（不属于任何特定技能的闲聊）

你必须返回一个 JSON 对象：
{"skill": "技能名", "action": "具体动作", "params": {}}

只返回 JSON，不要任何解释。`;

    const response = await llm.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature: 0,
      maxTokens: 150,
    });

    const content = response.choices[0].message.content.trim();

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (_) {}

    return { skill: '_general', action: 'chat', params: { rawReply: content } };
  }
}

module.exports = new DecisionEngine();
