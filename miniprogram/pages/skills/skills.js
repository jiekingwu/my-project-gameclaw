// pages/skills/skills.js
Page({
  data: {
    coreSkills: [
      { name: '省钻大师', desc: '智能分析充值性价比，推荐最优钻石方案', icon: '💎', iconBg: 'ico-orange', enabled: true, statusText: '已开启 · 本月为你省 188💎' },
      { name: '限时武器守护', desc: '自动追踪限时武器到期，提前提醒使用', icon: '⏰', iconBg: 'ico-red', enabled: true, statusText: '已开启 · 守护中 3 件即将到期' },
      { name: '段位规划师', desc: '定制段位晋升路线和练枪计划', icon: '📈', iconBg: 'ico-green', enabled: true, statusText: '已开启 · 目标：枪王' },
    ],
    querySkills: [
      { name: '枪械百科查询', desc: '武器数据、配件属性、地图攻略一问即答', icon: '🔍', iconBg: 'ico-purple', enabled: true, statusText: '已开启 · 全武器覆盖' },
      { name: '战绩分析', desc: '全面分析KD、爆头率、胜率等数据', icon: '📊', iconBg: 'ico-blue', enabled: true, statusText: '已开启 · 每周自动生成报告' },
      { name: '配枪推荐师', desc: '根据地图和模式推荐最佳武器搭配', icon: '🎯', iconBg: 'ico-cyan', enabled: true, statusText: '已开启' },
    ],
    welfareSkills: [
      { name: '福利情报员', desc: '全网搜集兑换码、隐藏福利、限时返钻', icon: '🎁', iconBg: 'ico-pink', enabled: true, statusText: '已开启 · 今日新增 3 条' },
      { name: '版本前瞻分析', desc: '预测新武器新地图，提前给出储钻建议', icon: '🔮', iconBg: 'ico-blue', enabled: true, statusText: '已开启 · 预计 4/1 更新' },
      { name: '健康游戏助手', desc: '游戏疲劳提醒、连输保护建议', icon: '❤️', iconBg: 'ico-pink', enabled: false, statusText: '已关闭' },
      { name: '每日任务提醒', desc: '智能提醒每日/每周待完成任务和奖励', icon: '✅', iconBg: 'ico-green', enabled: true, statusText: '已开启 · 今日 3/6 完成' },
    ],
  },

  onToggle(e) {
    const { index, group } = e.currentTarget.dataset;
    const enabled = e.detail.value;
    const key = `${group}[${index}].enabled`;
    const statusKey = `${group}[${index}].statusText`;

    this.setData({
      [key]: enabled,
      [statusKey]: enabled ? '已开启' : '已关闭',
    });

    wx.showToast({
      title: enabled ? '技能已开启' : '技能已关闭',
      icon: 'none',
      duration: 1000,
    });
  },
});
