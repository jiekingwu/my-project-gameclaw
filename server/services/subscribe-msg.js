/**
 * 微信订阅消息推送服务（Phase 2）
 * 生产环境需配置 WX_APPID / WX_SECRET / WX_TPL_REMINDER
 */
const axios = require('axios');
const config = require('../config');

let accessToken = null;
let tokenExpiry = 0;

/**
 * 获取小程序 access_token（缓存2小时）
 */
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const appid = config.wechat.appid;
  const secret = config.wechat.secret;

  if (!appid || !secret || appid.startsWith('wxTODO') || appid.startsWith('wxXXX')) {
    console.log('[SubscribeMsg] 未配置真实 AppID/Secret，跳过 token 获取');
    return null;
  }

  try {
    const res = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: { grant_type: 'client_credential', appid, secret },
    });

    if (res.data.access_token) {
      accessToken = res.data.access_token;
      tokenExpiry = Date.now() + (res.data.expires_in - 300) * 1000; // 提前5分钟过期
      return accessToken;
    }

    console.error('[SubscribeMsg] 获取 token 失败:', res.data);
    return null;
  } catch (err) {
    console.error('[SubscribeMsg] 获取 token 异常:', err.message);
    return null;
  }
}

/**
 * 发送订阅消息
 * @param {string} openid - 用户的 openid
 * @param {string} templateId - 模板消息ID
 * @param {object} data - 模板数据
 * @param {string} page - 跳转页面路径
 */
async function sendSubscribeMessage(openid, templateId, data, page = 'pages/chat/chat') {
  const token = await getAccessToken();
  if (!token) {
    console.log('[SubscribeMsg] 无 access_token，无法推送（开发环境正常）');
    return false;
  }

  try {
    const res = await axios.post(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
      {
        touser: openid,
        template_id: templateId,
        page,
        data,
      }
    );

    if (res.data.errcode === 0) {
      console.log(`[SubscribeMsg] 推送成功 → ${openid}`);
      return true;
    }

    console.warn('[SubscribeMsg] 推送失败:', res.data);
    return false;
  } catch (err) {
    console.error('[SubscribeMsg] 推送异常:', err.message);
    return false;
  }
}

/**
 * 发送提醒消息（简化接口）
 */
async function sendReminder(openid, { title, content, time }) {
  const templateId = config.wechat.tplReminder;
  if (!templateId) {
    console.log('[SubscribeMsg] 未配置 WX_TPL_REMINDER 模板ID');
    return false;
  }

  return sendSubscribeMessage(openid, templateId, {
    thing1: { value: title?.slice(0, 20) || '游戏提醒' },
    thing2: { value: content?.slice(0, 20) || '主人，该执行计划啦！' },
    time3: { value: time || new Date().toLocaleString('zh-CN') },
  });
}

module.exports = { sendSubscribeMessage, sendReminder, getAccessToken };
