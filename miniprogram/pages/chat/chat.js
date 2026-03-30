/**
 * 聊天页面 — Phase 2.5
 * 通过 ChatAgent 统一调用后端 Gateway（LLM + Function Calling）
 * 失败自动降级到本地对话引擎
 * 新增：消息轮询、动态提醒、scene参数还原、语音输入
 */
const chatAgent = require('../../agent/chat-agent');
const app = getApp();

let msgIdCounter = 0;
let pollTimer = null;

Page({
  data: {
    messages: [],
    inputText: '',
    isTyping: false,
    scrollToView: '',
    showInitialChips: true,
    initialChips: ['⏰ 到期武器', '💎 省钻方案', '✅ 每日任务', '🌤️ 今日天气'],
    playerData: {},
    isOnline: true,
    alertData: null,
    statusBarHeight: 20,
    currentTime: '',
  },

  onLoad(options) {
    const sysInfo = wx.getSystemInfoSync();
    const statusBarHeight = sysInfo.statusBarHeight || 20;

    const now = new Date();
    this.setData({
      statusBarHeight,
      playerData: app.globalData.playerData,
      currentTime: now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0'),
    });

    this.loadAlerts();

    if (options.scene) {
      this.handleScene(options.scene);
    }
  },

  onShow() {
    this.setData({
      playerData: app.globalData.playerData,
    });
    // 启动消息轮询
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  // ===== 消息轮询（10秒一次） =====
  startPolling() {
    this.stopPolling(); // 先停掉旧的
    pollTimer = setInterval(() => this.pollMessages(), 10000);
  },

  stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },

  async pollMessages() {
    const messages = await chatAgent.pollPendingMessages();
    if (messages.length > 0) {
      for (const msg of messages) {
        this.setData({
          messages: [...this.data.messages, {
            id: `msg-${++msgIdCounter}`,
            role: 'ai',
            content: msg.content,
            chips: msg.chips || [],
          }],
          scrollToView: '',
        });
        // 如果消息带有日历事件数据，暂存供「同步到日历」chip 使用
        if (msg.extra?.calendarEvent) {
          this._pendingCalendarEvent = msg.extra.calendarEvent;
        }
      }
      setTimeout(() => this.setData({ scrollToView: 'scroll-bottom' }), 100);
      wx.vibrateShort({ type: 'medium' });
    }
  },

  // ===== 加载动态提醒 =====
  async loadAlerts() {
    const data = await chatAgent.getAlerts();
    if (data) {
      this.setData({ alertData: data });
    }
  },

  // ===== 处理 scene 参数 =====
  handleScene(scene) {
    const sceneMap = {
      'weapon_expiry': '帮我看看有哪些武器快到期了',
      'diamond_plan': '最近有什么省钻石的充值方案吗？',
      'weekly_report': '帮我分析一下最近的战绩数据',
      'daily_task': '今天还有哪些任务没完成？',
      'reminder': '查看我的提醒列表',
    };
    const msg = sceneMap[scene];
    if (msg) {
      setTimeout(() => this.addUserMessage(msg), 500);
    }
  },

  // 技能快捷入口映射
  skillMessages: {
    '道具过期': '帮我看看有哪些武器快到期了',
    '省钱攻略': '最近有什么省钻石的充值方案吗？',
    '战力分析': '帮我分析一下最近的战绩数据',
    '成长规划': '帮我制定一个段位晋升计划',
    '自助查询': '我想查询一下枪械数据',
    '阵容推荐': '帮我推荐当前版本的最佳配枪',
    '福利中心': '现在有什么可以领的福利？',
    '版本前瞻': '下个版本会更新什么内容？',
    '今日任务': '今天还有哪些任务没完成？',
    '关怀助手': '我今天玩了多久了？',
  },

  // 输入处理
  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  // 发送消息
  onSend() {
    const text = this.data.inputText.trim();
    if (!text) return;
    this.setData({ inputText: '' });
    this.addUserMessage(text);
  },

  // 技能卡片点击
  onSkillTap(e) {
    const skill = e.detail.skill;
    const msg = this.skillMessages[skill] || skill;
    this.addUserMessage(msg);
  },

  // 提醒卡片点击
  onAlertTap(e) {
    const type = e.detail.type;
    const map = {
      danger: '帮我看看有哪些武器快到期了',
      warn: '最近有什么省钻石的充值方案吗？',
      info: '帮我分析一下最近的战绩数据',
    };
    this.addUserMessage(map[type] || '');
  },

  // Suggestion chip 点击
  onChipTap(e) {
    this.addUserMessage(e.detail.text);
  },

  // ===== 提醒日历确认卡片 =====
  onCalendarConfirm() {
    this.addToPhoneCalendar();
    this.hideCalendarConfirm();
  },

  onCalendarCancel() {
    this.hideCalendarConfirm();
    wx.showToast({ title: '已跳过', icon: 'none' });
  },

  hideCalendarConfirm() {
    if (!this._pendingCalendarMsgId) return;
    const messages = this.data.messages.map(m => {
      if (m.id === this._pendingCalendarMsgId) {
        return { ...m, showCalendarConfirm: false };
      }
      return m;
    });
    this.setData({ messages });
    this._pendingCalendarMsgId = null;
  },

  /** 同步提醒到手机系统日历 */
  addToPhoneCalendar() {
    const ev = this._pendingCalendarEvent;
    if (!ev) return;

    // wx.addPhoneCalendar 要求 startTime/endTime 为 unix 时间戳（秒）
    const startStr = (ev.startTime || '').replace('T', ' ').slice(0, 19);
    const startTs = Math.floor(new Date(startStr.replace(/-/g, '/')).getTime() / 1000);
    const endStr = (ev.endTime || '').replace('T', ' ').slice(0, 19);
    const endTs = endStr ? Math.floor(new Date(endStr.replace(/-/g, '/')).getTime() / 1000) : startTs;

    wx.addPhoneCalendar({
      title: (ev.title || 'ZhijiClaw 提醒').replace('[ZhijiClaw] ', ''),
      startTime: startTs,
      endTime: endTs,
      description: ev.description || '',
      alarm: true,
      alarmOffset: 300, // 提前5分钟（300秒）
      success: () => {
        wx.showToast({ title: '已写入日历', icon: 'success' });
        this._pendingCalendarEvent = null;
      },
      fail: (err) => {
        console.warn('[Calendar] 添加失败:', err);
        if (err.errMsg?.includes('cancel') || err.errMsg?.includes('deny')) {
          wx.showToast({ title: '已取消', icon: 'none' });
        } else {
          wx.showToast({ title: '请授权日历权限', icon: 'none' });
        }
      },
    });
  },

  // 添加用户消息 + 请求 AI 回复
  async addUserMessage(text) {
    const userMsg = {
      id: `msg-${++msgIdCounter}`,
      role: 'user',
      content: text,
    };

    this.setData({
      messages: [...this.data.messages, userMsg],
      showInitialChips: false,
      isTyping: true,
      scrollToView: '',
    });
    // 延迟设置确保渲染后触发滚动
    setTimeout(() => this.setData({ scrollToView: 'scroll-bottom' }), 100);

    try {
      const result = await chatAgent.send(text);

      const aiMsg = {
        id: `msg-${++msgIdCounter}`,
        role: 'ai',
        content: result.reply,
        chips: (result.chips || []).filter(c => !(c.includes('同步到') && c.includes('日历')) && !c.includes('📅')),
      };

      // 如果后端返回了日历事件数据，挂到消息对象上显示确认卡片
      if (result.calendarEvent) {
        const ev = result.calendarEvent;
        // 格式化显示时间
        const dt = (ev.startTime || '').replace('T', ' ').slice(0, 16);
        aiMsg.calendarEvent = { ...ev, displayTime: dt };
        aiMsg.showCalendarConfirm = true;
        this._pendingCalendarEvent = ev;
        this._pendingCalendarMsgId = aiMsg.id;
      }

      this.setData({
        messages: [...this.data.messages, aiMsg],
        isTyping: false,
        isOnline: result.meta?.mode === 'online',
        scrollToView: '',
      });
      setTimeout(() => this.setData({ scrollToView: 'scroll-bottom' }), 100);

      // 如果后端返回了新数据，更新全局画像
      if (result.data && result.meta?.mode === 'online') {
        this.updateGlobalProfile(result.data);
      }
    } catch (err) {
      console.error('[Chat] 回复失败:', err);
      this.setData({
        messages: [...this.data.messages, {
          id: `msg-${++msgIdCounter}`,
          role: 'ai',
          content: '😅 网络开小差了，主人稍等再试试～',
          chips: ['重试', '查看每日任务'],
        }],
        isTyping: false,
        scrollToView: '',
      });
      setTimeout(() => this.setData({ scrollToView: 'scroll-bottom' }), 100);
    }
  },

  // 更新全局画像数据
  updateGlobalProfile(data) {
    const pd = app.globalData.playerData;
    if (data.kd) pd.kd = parseFloat(data.kd);
    if (data.headshotRate) pd.headshotRate = parseFloat(data.headshotRate);
    if (data.winRate) pd.winRate = parseFloat(data.winRate);
    app.globalData.playerData = pd;
  },

  // ===== 导航跳转（带防重复点击） =====
  goSkills() {
    if (this._navLock) return;
    this._navLock = true;
    wx.navigateTo({
      url: '/pages/skills/skills',
      complete: () => { setTimeout(() => { this._navLock = false; }, 500); },
    });
  },

  goProfile() {
    if (this._navLock) return;
    this._navLock = true;
    wx.navigateTo({
      url: '/pages/profile/profile',
      complete: () => { setTimeout(() => { this._navLock = false; }, 500); },
    });
  },

  // 分享
  onShareAppMessage() {
    return {
      title: 'ZhijiClaw · 你的CF手游AI助理',
      path: '/pages/chat/chat',
    };
  },

  onShareTimeline() {
    return {
      title: 'ZhijiClaw · CF手游AI助理 - 省钻·追武器·上段位',
    };
  },
});
