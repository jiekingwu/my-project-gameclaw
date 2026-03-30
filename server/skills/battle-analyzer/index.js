/**
 * Skill: 战绩分析器
 * 功能：周报生成、KD分析、段位规划、同段位对比
 */
const db = require('../../data/database');

class BattleAnalyzerSkill {
  static async execute({ user, action, params, profile }) {
    switch (action) {
      case 'weekly_report':
        return BattleAnalyzerSkill.weeklyReport(user, profile);
      case 'weapon_stats':
        return BattleAnalyzerSkill.weaponStats(user, profile);
      case 'compare_peers':
        return BattleAnalyzerSkill.comparePeers(user, profile);
      case 'rank_plan':
        return BattleAnalyzerSkill.rankPlan(user, profile);
      case 'execute_plan':
        return BattleAnalyzerSkill.executePlan(user, profile);
      default:
        return BattleAnalyzerSkill.weeklyReport(user, profile);
    }
  }

  // 从画像读取称呼
  static _cn(profile) { return profile?.call_name || '主人'; }

  /**
   * 本周战绩报告（核心功能）
   */
  static async weeklyReport(user, profile) {
    const cn = this._cn(profile);
    const matches = await db.query(
      `SELECT result, kills, deaths, headshots, is_mvp, map_name, mode, rank_change, duration
       FROM match_records
       WHERE user_id = ? AND match_date >= date('now', '-7 days')
       ORDER BY match_date DESC`,
      [user.id]
    );

    if (matches.length === 0) {
      return {
        reply: `📊 **本周暂无对局记录**\n\n${cn}这周还没开始打呢～\n录入战绩数据后，我能给你生成超详细的分析报告！\n\n📝 **录入方式：**\n• 直接告诉我"今天打了5局排位，8杀3死"\n• 截图上传（即将支持 OCR 识别）`,
        chips: ['录入战绩', '查看历史报告', '段位规划'],
      };
    }

    // 聚合统计
    const totalGames = matches.length;
    const wins = matches.filter(m => m.result === 'win').length;
    const totalKills = matches.reduce((s, m) => s + m.kills, 0);
    const totalDeaths = matches.reduce((s, m) => s + m.deaths, 0);
    const totalHeadshots = matches.reduce((s, m) => s + m.headshots, 0);
    const mvpCount = matches.filter(m => m.is_mvp).length;
    const totalRankChange = matches.reduce((s, m) => s + m.rank_change, 0);

    const kd = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills;
    const winRate = ((wins / totalGames) * 100).toFixed(1);
    const headshotRate = totalKills > 0 ? ((totalHeadshots / totalKills) * 100).toFixed(1) : 0;
    const avgKills = (totalKills / totalGames).toFixed(1);
    const mvpRate = ((mvpCount / totalGames) * 100).toFixed(1);

    // 对比趋势
    const prevKd = parseFloat(profile.latest_kd) || 0;
    const kdTrend = kd - prevKd > 0 ? `↑${(kd - prevKd).toFixed(2)}` : kd - prevKd < 0 ? `↓${Math.abs(kd - prevKd).toFixed(2)}` : '→';
    const rankTrend = totalRankChange > 0 ? `+${totalRankChange}分` : `${totalRankChange}分`;

    // 提升建议
    const tips = [];
    if (parseFloat(headshotRate) < 25) tips.push('① 提高爆头率 → 多练准心预瞄');
    if (parseFloat(winRate) < 55) tips.push('② 提升胜率 → 注重团队配合');
    if (parseFloat(avgKills) < 8) tips.push('③ 提高场均击杀 → 多练枪房热手');
    if (tips.length === 0) tips.push('🎉 数据全面优秀，保持现在的节奏！');

    // 更新画像
    await db.query(
      `UPDATE user_profiles SET latest_kd = ?, headshot_rate = ?, win_rate = ?, avg_kills = ? WHERE user_id = ?`,
      [kd, headshotRate, winRate, avgKills, user.id]
    );

    return {
      reply: `📊 **本周战绩报告**\n\n| 指标 | 数值 | 趋势 |\n|------|------|------|\n| KD比 | ${kd} | ${kdTrend} |\n| 排位段位 | ${profile.current_rank || '未知'} | ${rankTrend} |\n| 胜率 | ${winRate}% | ${totalGames}场 |\n| 爆头率 | ${headshotRate}% | ${totalHeadshots}次 |\n| MVP | ${mvpCount}次/${totalGames}场 | ${mvpRate}% |\n| 场均击杀 | ${avgKills} | 总${totalKills}杀 |\n\n⚡ **提升建议：**\n${tips.join('\n')}\n\n${parseFloat(kd) >= 1.8 ? '照这个节奏冲段没问题 🎯' : `加油${cn}，潜力很大！💪`}`,
      chips: ['详细枪械分析', '对比同段玩家', '段位规划'],
      data: { kd, winRate, headshotRate, avgKills, mvpRate, totalGames, wins, totalRankChange },
    };
  }

  /**
   * 枪械使用统计
   */
  static async weaponStats(user, profile) {
    const mainW = profile?.main_weapon || '未设置';
    const subW = profile?.sub_weapon || '未设置';
    return {
      reply: `🔫 **常用枪械深度分析**\n\n| 枪械 | 定位 | 评价 |\n|------|------|------|\n| ${mainW} | 主武器 | 💪 核心输出 |\n| ${subW} | 副武器 | 🎯 稳定之选 |\n| AWM | 偶尔使用 | 🔭 可多练 |\n\n💡 **建议：**\n• ${mainW}爆头率可继续提升 → 练习压枪+预判\n• AWM命中率有提升空间 → 多练甩狙\n• 可以尝试沙鹰作为副武器 → 补刀神器`,
      chips: ['压枪技巧', '狙击练习建议', '查看段位数据'],
    };
  }

  /**
   * 同段位玩家对比
   */
  static async comparePeers(user, profile) {
    const RANK_BENCHMARKS = {
      '钻石5': { kd: 1.3, headshot: 20, winRate: 50, avgKills: 6.5 },
      '钻石4': { kd: 1.35, headshot: 21, winRate: 51, avgKills: 7.0 },
      '钻石3': { kd: 1.45, headshot: 22, winRate: 52, avgKills: 7.5 },
      '钻石2': { kd: 1.55, headshot: 23, winRate: 53, avgKills: 7.8 },
      '钻石1': { kd: 1.65, headshot: 24, winRate: 54, avgKills: 8.0 },
      '枪王': { kd: 1.80, headshot: 26, winRate: 56, avgKills: 9.0 },
    };

    const rank = profile.current_rank;
    if (!rank || !RANK_BENCHMARKS[rank]) {
      return {
        reply: `📊 还不知道${this._cn(profile)}的段位呢～\n\n告诉我你的段位（比如"我是钻石3"），我就能帮你做同段位对比分析了！`,
        chips: ['我是钻石3', '我是枪王', '查看战绩'],
      };
    }

    const bench = RANK_BENCHMARKS[rank];
    const myKd = parseFloat(profile.latest_kd) || 0;
    const myHs = parseFloat(profile.headshot_rate) || 0;
    const myWr = parseFloat(profile.win_rate) || 0;
    const myKills = parseFloat(profile.avg_kills) || 0;

    if (myKd === 0) {
      return {
        reply: `📊 ${this._cn(profile)}还没有战绩数据呢～\n\n先告诉我你的KD（比如"我KD 1.8"），或者录入几场战绩，我就能帮你做对比分析了！`,
        chips: ['录入战绩', '我KD 1.8', '查看任务'],
      };
    }

    const pct = (my, avg) => {
      const diff = ((my - avg) / avg * 100).toFixed(0);
      return diff > 0 ? `+${diff}%` : `${diff}%`;
    };

    return {
      reply: `📊 **同段位玩家对比（${rank}）**\n\n| 指标 | 你 / 平均 | 领先 |\n|------|-----------|------|\n| KD比 | ${myKd} / ${bench.kd} | ${pct(myKd, bench.kd)} |\n| 爆头率 | ${myHs}% / ${bench.headshot}% | ${pct(myHs, bench.headshot)} |\n| 胜率 | ${myWr}% / ${bench.winRate}% | ${pct(myWr, bench.winRate)} |\n| 场均击杀 | ${myKills} / ${bench.avgKills} | ${pct(myKills, bench.avgKills)} |\n\n${myKd >= bench.kd ? '✅ KD和击杀全面领先！' : '⚠️ KD有提升空间'}\n🎯 ${myKd >= bench.kd * 1.15 ? '以你的数据，冲更高段完全有可能！' : '保持练习，稳步提升！'}`,
      chips: ['冲段建议', '压枪练习', '查看地图胜率'],
    };
  }

  /**
   * 段位规划
   */
  static async rankPlan(user, profile) {
    const cn = this._cn(profile);
    const currentRank = profile.current_rank;
    const kd = parseFloat(profile.latest_kd) || 0;

    if (!currentRank) {
      return {
        reply: `📈 ${cn}，我还不知道你目前的段位呢～\n\n告诉我你的段位，我来帮你做专属的晋升规划！`,
        chips: ['我是钻石3', '我是钻石1', '我是枪王'],
      };
    }

    const targetRank = currentRank.includes('钻石') ? '枪王' : '大师';
    const mainW = profile.main_weapon || '步枪';

    return {
      reply: `📈 **专属段位晋升规划**\n\n${cn}，根据你目前的数据分析：\n\n📊 预计段位：${currentRank} → ${targetRank}\n${kd > 0 ? `📊 预计KD：${kd} → ${(kd + 0.3).toFixed(1)}+` : ''}\n\n🎯 **核心提升方向：**\n① ${mainW}压枪练习（每天30分钟）\n② 地图战术理解（沙漠灰/运输船）\n③ 团队配合意识（报点+补枪）\n\n跟着计划一步步来，稳步上分！🎯`,
      chips: ['开始执行计划', '调整目标', '查看练枪技巧'],
    };
  }

  /**
   * 执行计划
   */
  static async executePlan(user, profile) {
    const cn = this._cn(profile);
    const currentRank = profile.current_rank || '当前段位';
    const targetRank = currentRank.includes('钻石') ? '枪王' : '大师';
    const mainW = profile.main_weapon || '步枪';

    return {
      reply: `🚀 **段位晋升执行计划**\n\n📋 **第一周：${currentRank}→${targetRank}**\n○ 每天至少3局排位赛\n○ 练习${mainW}压枪30分钟/天\n○ 学习3张核心地图战术\n\n📅 **每日节奏：**\n🔫 练枪房15分钟 → 排位3-5局 → 回顾表现\n\n✅ 我会每天提醒你执行进度！加油${cn}！💪`,
      chips: ['查看练枪技巧', '调整计划节奏', '设置每日提醒'],
    };
  }
}

module.exports = BattleAnalyzerSkill;
