/**
 * LLM Function Calling — Tool 定义表（Phase 2.5）
 * 这些 Tool 会传给 LLM，让它自主决定该调用哪个
 */

const TOOLS = [
  // ===== 提醒 =====
  {
    type: 'function',
    function: {
      name: 'set_reminder',
      description: '为用户设置一个定时提醒。例如：提醒我明天中午12点喝水、10分钟后提醒我打排位',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '提醒内容，如"喝水"、"打排位"' },
          remind_at: { type: 'string', description: '提醒时间，ISO 8601格式，如 2026-03-28T12:00:00。如果用户说"10分钟后"，计算出绝对时间' },
        },
        required: ['content', 'remind_at'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_reminders',
      description: '查看用户所有待执行的提醒列表',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_reminder',
      description: '删除一个提醒',
      parameters: {
        type: 'object',
        properties: {
          reminder_id: { type: 'number', description: '要删除的提醒ID' },
        },
        required: ['reminder_id'],
      },
    },
  },

  // ===== 武器管理 =====
  {
    type: 'function',
    function: {
      name: 'check_expiring_weapons',
      description: '检查用户即将到期的限时武器',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'make_weapon_usage_plan',
      description: '为即将到期的武器制定使用计划',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_weapon_reminder',
      description: '为限时武器设置到期提醒',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  // ===== 战绩 =====
  {
    type: 'function',
    function: {
      name: 'get_weekly_report',
      description: '获取用户本周战绩报告（KD、胜率、爆头率等）',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_match',
      description: '录入一场对局战绩数据',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', description: '模式：排位赛/团队竞技/爆破/挑战', default: '排位赛' },
          map_name: { type: 'string', description: '地图名，如沙漠灰、运输船' },
          result: { type: 'string', description: '结果：win/lose' },
          kills: { type: 'number', description: '击杀数' },
          deaths: { type: 'number', description: '死亡数' },
          headshots: { type: 'number', description: '爆头数' },
        },
        required: ['kills', 'deaths'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_peers',
      description: '对比用户数据和同段位平均水平',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_rank_plan',
      description: '获取段位晋升规划建议',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  // ===== 钻石管家 =====
  {
    type: 'function',
    function: {
      name: 'analyze_diamond_plan',
      description: '分析省钻方案、充值建议',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['analyze', 'tips', 'budget'], description: '分析类型' },
        },
        required: [],
      },
    },
  },

  // ===== 每日任务 =====
  {
    type: 'function',
    function: {
      name: 'get_daily_tasks',
      description: '获取今日任务清单和完成情况',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: '标记一个每日任务为已完成',
      parameters: {
        type: 'object',
        properties: {
          task_name: { type: 'string', description: '任务名称关键词' },
        },
        required: ['task_name'],
      },
    },
  },

  // ===== 百科查询 =====
  {
    type: 'function',
    function: {
      name: 'query_weapon_wiki',
      description: '查询枪械百科数据（属性、技巧、评级）',
      parameters: {
        type: 'object',
        properties: {
          weapon_name: { type: 'string', description: '枪械名称，如AK47、M4A1、AWM' },
        },
        required: ['weapon_name'],
      },
    },
  },

  // ===== 玩家画像 =====
  {
    type: 'function',
    function: {
      name: 'get_player_profile',
      description: '获取当前玩家的完整画像数据（段位、KD、钻石、武器等）',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  // ===== 天气查询 =====
  {
    type: 'function',
    function: {
      name: 'query_weather',
      description: '查询指定城市的实时天气和未来3天预报。支持中文城市名。如果用户没有明确说查哪个城市，就不要传city参数，系统会自动使用用户画像中保存的城市。',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称，中文或英文，如"深圳"、"Beijing"' },
        },
        required: [],
      },
    },
  },
];

module.exports = TOOLS;
