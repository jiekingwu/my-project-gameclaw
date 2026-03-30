/**
 * 认证路由
 * POST /api/auth/login      — 微信登录
 * POST /api/auth/refresh     — 刷新 token
 * POST /api/auth/dev-login   — 开发环境模拟登录
 */
const express = require('express');
const router = express.Router();
const config = require('../config');
const wechatAuth = require('../services/wechat-auth');
const jwt = require('jsonwebtoken');
const db = require('../data/database');

// 微信登录
router.post('/login', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ code: 400, message: '缺少 code 参数' });
    const result = await wechatAuth.loginOrRegister(code);
    res.json({ code: 0, data: result });
  } catch (err) {
    console.error('[Auth] 微信登录失败:', err.message);
    // 返回有意义的错误（方便调试微信配置问题）
    res.status(500).json({
      code: 500,
      message: `登录失败: ${err.message?.slice(0, 100)}`,
    });
  }
});

// 刷新 token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ code: 400, message: '缺少 refresh_token' });
    const result = await wechatAuth.refreshAccessToken(refresh_token);
    res.json({ code: 0, data: result });
  } catch (err) {
    next(err);
  }
});

// 开发环境模拟登录（跳过微信）
if (config.env === 'development') {
  router.post('/dev-login', async (req, res, next) => {
    try {
      const fakeOpenid = 'dev_jieking_001';

      let user = await db.queryOne(
        'SELECT id, openid, nickname FROM users WHERE openid = ?',
        [fakeOpenid]
      );

      if (!user) {
        const userId = await db.insert(
          'INSERT INTO users (openid, nickname) VALUES (?, ?)',
          [fakeOpenid, 'jieking']
        );
        await db.insert(
          `INSERT INTO user_profiles (user_id, current_rank, rank_stars, latest_kd, headshot_rate, win_rate, avg_kills, total_games, main_weapon, total_diamonds, has_month_card)
           VALUES (?, '钻石3', 2, 1.82, 24.3, 56.0, 8.2, 1280, 'AK47', 2180, 1)`,
          [userId]
        );
        // 插入模拟武器数据
        const weapons = [
          [userId, '火麒麟-AK47', 'rifle', 'hero'],
          [userId, '黑龙-M4A1', 'rifle', 'hero'],
          [userId, '翔龙-AWM', 'sniper', 'hero'],
        ];
        for (const w of weapons) {
          await db.query(
            `INSERT INTO weapons_inventory (user_id, weapon_name, weapon_type, quality, is_permanent, expiry_time)
             VALUES (?, ?, ?, ?, 0, datetime('now', '+1 day'))`,
            w
          );
        }
        // 插入模拟对局记录
        const maps = ['沙漠灰', '运输船', '新年广场'];
        for (let i = 0; i < 7; i++) {
          const win = Math.random() > 0.44;
          const kills = Math.floor(Math.random() * 8) + 4;
          const deaths = Math.floor(Math.random() * 5) + 2;
          const matchDate = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
          await db.query(
            `INSERT INTO match_records (user_id, match_date, mode, map_name, result, kills, deaths, assists, headshots, is_mvp, duration, rank_change, data_source)
             VALUES (?, ?, '排位赛', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
            [userId, matchDate, maps[i % 3], win ? 'win' : 'lose', kills, deaths, Math.floor(Math.random() * 4), Math.floor(kills * 0.24), kills > 8 ? 1 : 0, 1200 + Math.floor(Math.random() * 600), win ? 8 : -5]
          );
        }
        user = { id: userId, openid: fakeOpenid, nickname: 'jieking' };
        console.log('[Auth] 开发用户创建完成，含模拟数据');
      }

      const accessToken = jwt.sign(
        { userId: user.id, openid: user.openid },
        config.jwt.secret,
        { expiresIn: '30d' }
      );

      res.json({
        code: 0,
        data: { user, accessToken, refreshToken: accessToken },
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = router;
