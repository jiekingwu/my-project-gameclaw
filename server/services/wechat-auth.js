/**
 * 微信登录服务
 * code2session → 获取 openid → 创建/查找用户 → 签发 JWT
 */
const axios = require('axios');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../data/database');

/**
 * 用微信 code 换取 session_key + openid
 */
async function code2session(code) {
  const res = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
    params: {
      appid: config.wechat.appid,
      secret: config.wechat.secret,
      js_code: code,
      grant_type: 'authorization_code',
    },
  });

  if (res.data.errcode) {
    throw new Error(`微信登录失败: ${res.data.errmsg}`);
  }

  return {
    openid: res.data.openid,
    sessionKey: res.data.session_key,
    unionId: res.data.unionid || null,
  };
}

/**
 * 登录或注册用户，返回 JWT
 */
async function loginOrRegister(code) {
  const wxData = await code2session(code);

  let user = await db.queryOne(
    'SELECT id, openid, nickname FROM users WHERE openid = ?',
    [wxData.openid]
  );

  if (!user) {
    const userId = await db.insert(
      'INSERT INTO users (openid, union_id, session_key) VALUES (?, ?, ?)',
      [wxData.openid, wxData.unionId, wxData.sessionKey]
    );
    await db.insert('INSERT INTO user_profiles (user_id) VALUES (?)', [userId]);
    user = { id: userId, openid: wxData.openid, nickname: '' };
    console.log(`[Auth] 新用户注册: userId=${userId}`);
  } else {
    await db.query('UPDATE users SET session_key = ? WHERE id = ?', [wxData.sessionKey, user.id]);
  }

  const accessToken = jwt.sign(
    { userId: user.id, openid: user.openid },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  return { user, accessToken, refreshToken };
}

/**
 * 刷新 token
 */
async function refreshAccessToken(refreshToken) {
  const decoded = jwt.verify(refreshToken, config.jwt.secret);
  if (decoded.type !== 'refresh') throw new Error('无效的 refresh token');

  const user = await db.queryOne(
    'SELECT id, openid, nickname FROM users WHERE id = ?',
    [decoded.userId]
  );
  if (!user) throw new Error('用户不存在');

  const accessToken = jwt.sign(
    { userId: user.id, openid: user.openid },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  return { accessToken };
}

module.exports = { loginOrRegister, refreshAccessToken };
