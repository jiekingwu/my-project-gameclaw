/**
 * 环境配置中心（Phase 2.5）
 * 从 .env 读取，统一导出
 */
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3900,
  env: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'zhijiclaw',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  wechat: {
    appid: process.env.WX_APPID || '',
    secret: process.env.WX_SECRET || '',
    tplReminder: process.env.WX_TPL_REMINDER || '', // 提醒类订阅消息模板ID
  },

  llm: {
    provider: process.env.LLM_PROVIDER || 'deepseek',
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.LLM_MODEL || 'deepseek-chat',
  },

  // 企微配置（Phase 2 预留）
  wecom: {
    corpid: process.env.WECOM_CORPID || '',
    corpsecret: process.env.WECOM_CORPSECRET || '',
    agentid: process.env.WECOM_AGENTID || '',
    botKey: process.env.WECOM_BOT_KEY || '',
  },
};
