/**
 * ZhijiClaw 小程序入口
 * Phase 1: 接入 Node.js 后端
 */
const chatAgent = require('./agent/chat-agent');

App({
  globalData: {
    userInfo: null,
    isLoggedIn: false,
    // 默认离线数据（登录后用后端真实数据覆盖）
    playerData: {
      nickname: '',
      rank: '未知',
      kd: 0,
      headshotRate: 0,
      winRate: 0,
      mvpRate: 0,
      daysPlayed: 0,
      diamondsSaved: 0,
      weaponsGuarded: 0,
    },
  },

  async onLaunch() {
    // 初始化云环境（云托管 callContainer 需要）
    if (wx.cloud) {
      wx.cloud.init({
        env: 'your-cloud-env-id',  // 替换为你的云环境ID
        traceUser: true,
      });
    }
    await this.initLogin();
  },

  /**
   * 登录初始化
   */
  async initLogin() {
    const token = wx.getStorageSync('access_token');

    if (token) {
      this.globalData.isLoggedIn = true;
      this.loadProfile();
      return;
    }

    try {
      // 自动区分环境：开发版用 dev-login，体验版/正式版用微信登录
      let envVersion = 'release';
      try {
        const accountInfo = wx.getAccountInfoSync();
        envVersion = accountInfo.miniProgram.envVersion || 'release';
      } catch (_) {}

      const result = envVersion === 'develop'
        ? await chatAgent.devLogin()
        : await chatAgent.wxLogin();

      if (result) {
        this.globalData.isLoggedIn = true;
        this.globalData.userInfo = result.user;
        this.loadProfile();
        console.log('[App] 登录成功');
      }
    } catch (err) {
      console.error('[App] 登录失败，使用离线模式:', err);
    }
  },

  /**
   * 加载用户画像数据
   */
  async loadProfile() {
    try {
      const data = await chatAgent.getProfile();
      if (data && data.profile) {
        const p = data.profile;
        // 计算陪伴天数
        let daysPlayed = 0;
        try {
          const created = data.user?.created_at;
          if (created) {
            daysPlayed = Math.max(1, Math.floor((Date.now() - new Date(created).getTime()) / 86400000));
          }
        } catch (_) {}

        this.globalData.playerData = {
          nickname: p.call_name || data.user?.nickname || '玩家',
          rank: p.current_rank || '未知',
          kd: parseFloat(p.latest_kd) || 0,
          headshotRate: parseFloat(p.headshot_rate) || 0,
          winRate: parseFloat(p.win_rate) || 0,
          mvpRate: 0,
          daysPlayed: daysPlayed || 1,
          diamondsSaved: p.total_diamonds || 0,
          weaponsGuarded: data.weapons?.total || 0,
          expiringWeapons: data.weapons?.expiring_soon || 0,
        };
        console.log('[App] 画像加载成功:', this.globalData.playerData);
      }
    } catch (err) {
      console.warn('[App] 画像加载失败，使用默认数据:', err.message);
    }
  },
});
