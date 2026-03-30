// pages/profile/profile.js
const chatAgent = require('../../agent/chat-agent');
const app = getApp();

Page({
  data: {
    playerData: {},
    menuItems: [],
    gameRole: null,
    showRoleModal: false,
    roleForm: { nickname: '', server: '', gameId: '' },
  },

  onLoad() {
    this.refreshData();
    this.loadGameRole();
  },

  onShow() {
    this.refreshData();
  },

  refreshData() {
    const pd = app.globalData.playerData;
    this.setData({
      playerData: pd,
      menuItems: [
        { title: '我的战绩数据', desc: `KD ${pd.kd || '-'} · 爆头率 ${pd.headshotRate || '-'}%`, icon: '📊', iconBg: 'ico-blue' },
        { title: '省钻记录', desc: `累计节省 ${pd.diamondsSaved || 0}💎`, icon: '💎', iconBg: 'ico-orange' },
        { title: '武器守护记录', desc: `已守护 ${pd.weaponsGuarded || 0} 件武器`, icon: '⏰', iconBg: 'ico-red', badge: pd.expiringWeapons > 0 ? String(pd.expiringWeapons) : '' },
        { title: '提醒设置', desc: '武器到期、活动开启提醒', icon: '🔔', iconBg: 'ico-green' },
        { title: '意见反馈', icon: '💬', iconBg: 'ico-pink' },
      ],
    });
  },

  async loadGameRole() {
    const gameRole = await chatAgent.getGameRole();
    if (gameRole) {
      this.setData({ gameRole });
      // 同步到全局数据，让其他页面也能用
      app.globalData.playerData.nickname = gameRole.nickname;
    }
  },

  // ===== 角色编辑弹窗 =====
  onEditRole() {
    const gr = this.data.gameRole;
    this.setData({
      showRoleModal: true,
      roleForm: {
        nickname: gr?.nickname || '',
        server: gr?.server || '',
        gameId: gr?.gameId || '',
      },
    });
  },

  onCloseModal() {
    this.setData({ showRoleModal: false });
  },

  onRoleNickname(e) { this.setData({ 'roleForm.nickname': e.detail.value }); },
  onRoleServer(e) { this.setData({ 'roleForm.server': e.detail.value }); },
  onRoleGameId(e) { this.setData({ 'roleForm.gameId': e.detail.value }); },

  async onSaveRole() {
    const { nickname, server, gameId } = this.data.roleForm;
    if (!nickname.trim()) {
      wx.showToast({ title: '请输入角色昵称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    try {
      const result = await chatAgent.saveGameRole({ nickname, server, gameId });
      wx.hideLoading();

      if (result?.gameRole) {
        this.setData({
          gameRole: result.gameRole,
          showRoleModal: false,
        });
        app.globalData.playerData.nickname = result.gameRole.nickname;
        wx.showToast({ title: '保存成功', icon: 'success' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败：' + (err.message || '网络错误'), icon: 'none' });
    }
  },

  onMenuTap(e) {
    const { index } = e.currentTarget.dataset;
    const item = this.data.menuItems[index];
    wx.showToast({ title: `${item.title} - 开发中`, icon: 'none' });
  },
});
