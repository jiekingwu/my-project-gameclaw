/**
 * ZhijiClaw 后端主入口（Phase 2.5）
 * Express + SQLite + LLM Function Calling
 */

// 🕐 统一使用北京时间（UTC+8）
process.env.TZ = 'Asia/Shanghai';

// 全局错误保护 — 防止未处理的异常导致服务崩溃
process.on('uncaughtException', (err) => {
  console.error('[Fatal] Uncaught Exception:', err.message);
  console.error(err.stack?.slice(0, 500));
});
process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] Unhandled Rejection:', reason?.message || reason);
});

const express = require('express');
const cors = require('cors');
const config = require('./config');
const gatewayRouter = require('./routes/gateway');
const authRouter = require('./routes/auth');
const { errorHandler } = require('./middleware/error-handler');
const db = require('./data/database');
const cronScanner = require('./services/cron-scanner');

const path = require('path');

const app = express();

// ===== 中间件 =====
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 静态文件（Demo 页面）
app.use('/demo', express.static(path.join(__dirname, '..')));

// 请求日志（开发环境）
if (config.env === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleString('zh-CN')}] ${req.method} ${req.path}`);
    next();
  });
}

// ===== 路由 =====
app.use('/api/auth', authRouter);
app.use('/api/gateway', gatewayRouter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'zhijiclaw', version: '2.5.0' });
});

// ===== 错误处理 =====
app.use(errorHandler);

// ===== 启动 =====
async function start() {
  try {
    await db.query('SELECT 1');
    console.log('✅ SQLite 连接成功');

    // WAL checkpoint（防止WAL积压导致数据库锁）
    try { db.db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
    setInterval(() => {
      try { db.db.pragma('wal_checkpoint(PASSIVE)'); } catch (e) {}
    }, 300000); // 每5分钟

    // 启动定时扫描器
    cronScanner.start(10000); // 每10秒扫描一次（支持短时提醒）

    // 预加载灵魂文件
    const { loadSoul } = require('./soul/loader');
    loadSoul();

    const port = process.env.PORT || config.port;
    app.listen(port, () => {
      console.log(`🚀 ZhijiClaw 后端启动成功: http://localhost:${port}`);
      console.log(`📋 环境: ${config.env}`);
      console.log(`🤖 LLM: ${config.llm.provider} / ${config.llm.model}`);
      console.log(`⏰ Cron Scanner: 已启动`);
      console.log(`📌 版本: 2.5.0 (Phase 2.5 - Function Calling)`);
    });
  } catch (err) {
    console.error('❌ 启动失败:', err.message);
    process.exit(1);
  }
}

start();
