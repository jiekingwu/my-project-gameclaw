/**
 * JWT 鉴权中间件
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../data/database');

/**
 * 验证 JWT token，注入 req.user
 */
async function authRequired(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未登录' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, config.jwt.secret);

    const user = await db.queryOne(
      'SELECT id, openid, nickname, avatar_url, created_at FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: 'token 已过期' });
    }
    return res.status(401).json({ code: 401, message: '认证失败' });
  }
}

/**
 * 可选认证 — 有 token 就解析，没有也放行
 */
async function authOptional(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await db.queryOne(
        'SELECT id, openid, nickname FROM users WHERE id = ?',
        [decoded.userId]
      );
      if (user) req.user = user;
    }
  } catch (_) {
    // 忽略错误，视为未登录
  }
  next();
}

module.exports = { authRequired, authOptional };
