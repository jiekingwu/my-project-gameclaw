/**
 * 统一时间工具 — 北京时间（UTC+8）
 * 
 * 核心原则：
 * 1. JS 层：process.env.TZ = 'Asia/Shanghai' 已在 app.js 设置
 * 2. SQLite 层：所有 datetime('now') 改为 datetime('now', 'localtime')
 * 3. 存入 DB 的时间统一用 "YYYY-MM-DD HH:MM:SS" 格式（北京时间）
 */

/**
 * 获取当前北京时间的 SQLite 兼容字符串
 * 格式: "2026-03-28 16:30:00"
 */
function nowBeijing() {
  const d = new Date();
  const y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${M}-${D} ${h}:${m}:${s}`;
}

/**
 * 获取当前北京时间的 ISO 8601 字符串（带时区偏移）
 * 格式: "2026-03-28T16:30:00+08:00"
 */
function nowBeijingISO() {
  return nowBeijing().replace(' ', 'T') + '+08:00';
}

/**
 * 获取当前北京日期
 * 格式: "2026-03-28"
 */
function todayBeijing() {
  return nowBeijing().slice(0, 10);
}

/**
 * 将任意时间字符串标准化为 SQLite 兼容格式（北京时间）
 * 支持：ISO 8601（2026-03-28T08:15:09.281Z）、SQLite 格式、相对时间等
 * 
 * @param {string} timeStr - 时间字符串
 * @returns {string} "YYYY-MM-DD HH:MM:SS" 格式（北京时间）
 */
function normalizeToBeijing(timeStr) {
  if (!timeStr) return nowBeijing();
  
  try {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      // TZ 已设为 Asia/Shanghai，直接用本地时间格式化
      const y = d.getFullYear();
      const M = String(d.getMonth() + 1).padStart(2, '0');
      const D = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return `${y}-${M}-${D} ${h}:${m}:${s}`;
    }
  } catch (_) {}
  
  // 无法解析，去掉 T 和 Z 后原样返回
  return timeStr.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '');
}

/**
 * SQLite datetime('now') 的北京时间替代
 * 在 SQL 中使用: datetime('now', 'localtime')
 * 或直接用 JS 生成时间参数传入
 */
const SQLITE_NOW_BEIJING = "datetime('now', 'localtime')";

module.exports = {
  nowBeijing,
  nowBeijingISO,
  todayBeijing,
  normalizeToBeijing,
  SQLITE_NOW_BEIJING,
};
