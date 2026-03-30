/**
 * 前端 Agent 封装（Phase 2.5 升级）
 * 统一管理对话请求、离线兜底、加载状态、消息轮询
 */
const { request } = require('../utils/request');
const { getReply } = require('../utils/dialog-engine');

class ChatAgent {
  constructor() {
    this.isOnline = true;
    this.retryCount = 0;
    this.maxRetries = 2;
  }

  /**
   * 发送消息到后端 Gateway
   * 失败自动降级到本地对话引擎
   */
  async send(userText) {
    if (this.isOnline) {
      try {
        const result = await request({
          url: '/gateway/chat',
          method: 'POST',
          data: { message: userText },
        });

        this.retryCount = 0;
        return {
          reply: result.reply,
          chips: result.chips || [],
          data: result.data || null,
          calendarEvent: result.calendarEvent || null,
          meta: { ...result.meta, mode: 'online' },
        };
      } catch (err) {
        console.warn('[ChatAgent] 在线请求失败:', err.message);
        this.retryCount++;

        if (this.retryCount >= this.maxRetries) {
          this.isOnline = false;
          console.log('[ChatAgent] 切换到离线模式');
          wx.showToast({ title: '网络不佳，使用离线模式', icon: 'none' });

          setTimeout(() => {
            this.isOnline = true;
            this.retryCount = 0;
            console.log('[ChatAgent] 尝试恢复在线模式');
          }, 30000);
        }
      }
    }

    // 离线兜底
    const localResult = getReply(userText);
    return {
      reply: localResult.reply,
      chips: localResult.chips || [],
      data: null,
      meta: { mode: 'offline', source: 'local_rule' },
    };
  }

  /**
   * 获取用户画像数据
   */
  async getProfile() {
    try {
      return await request({ url: '/gateway/profile' });
    } catch (err) {
      console.warn('[ChatAgent] 获取画像失败:', err.message);
      return null;
    }
  }

  /**
   * 获取智能提醒数据（Phase 2）
   */
  async getAlerts() {
    try {
      return await request({ url: '/gateway/alerts' });
    } catch (err) {
      console.warn('[ChatAgent] 获取提醒失败:', err.message);
      return null;
    }
  }

  /**
   * 轮询待消费消息（Phase 2.5）
   * 返回数组或空数组
   */
  async pollPendingMessages() {
    try {
      const data = await request({ url: '/gateway/pending-messages' });
      return data?.messages || [];
    } catch (err) {
      // 轮询失败不打日志，避免刷屏
      return [];
    }
  }

  /**
   * 获取游戏角色信息
   */
  async getGameRole() {
    try {
      const data = await request({ url: '/gateway/game-role' });
      return data?.gameRole || null;
    } catch (err) {
      console.warn('[ChatAgent] 获取游戏角色失败:', err.message);
      return null;
    }
  }

  /**
   * 保存游戏角色信息
   */
  async saveGameRole({ nickname, server, gameId }) {
    return await request({
      url: '/gateway/game-role',
      method: 'POST',
      data: { nickname, server, gameId },
    });
  }

  /**
   * 开发环境模拟登录
   */
  async devLogin() {
    try {
      const result = await request({
        url: '/auth/dev-login',
        method: 'POST',
      });
      wx.setStorageSync('access_token', result.accessToken);
      wx.setStorageSync('refresh_token', result.refreshToken);
      console.log('[ChatAgent] 开发登录成功:', result.user);
      return result;
    } catch (err) {
      console.error('[ChatAgent] 开发登录失败:', err);
      return null;
    }
  }

  /**
   * 正式微信登录
   */
  async wxLogin() {
    try {
      const { code } = await wx.login();
      const result = await request({
        url: '/auth/login',
        method: 'POST',
        data: { code },
      });
      wx.setStorageSync('access_token', result.accessToken);
      wx.setStorageSync('refresh_token', result.refreshToken);
      return result;
    } catch (err) {
      console.error('[ChatAgent] 微信登录失败:', err);
      return null;
    }
  }
}

module.exports = new ChatAgent();
