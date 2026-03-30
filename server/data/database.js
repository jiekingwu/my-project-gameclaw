/**
 * SQLite 数据库封装
 * API 兼容原 MySQL 版本，其他模块无需修改
 * 数据文件：server/data/zhijiclaw.db
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'zhijiclaw.db');
const db = new Database(DB_PATH);

// 开启 WAL 模式（并发性能更好）
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * 通用查询 — 兼容 mysql2 的 execute(sql, params) 接口
 * SQLite 的 ? 占位符和 MySQL 一样
 */
function query(sql, params = []) {
  // 将 MySQL 特有语法转为 SQLite 兼容语法
  const sqliteSql = convertMySQLToSQLite(sql);

  try {
    if (sqliteSql.trim().toUpperCase().startsWith('SELECT') ||
        sqliteSql.trim().toUpperCase().startsWith('WITH')) {
      const stmt = db.prepare(sqliteSql);
      return stmt.all(...params);
    } else {
      const stmt = db.prepare(sqliteSql);
      const result = stmt.run(...params);
      return result;
    }
  } catch (err) {
    // 如果是 "SELECT 1" 健康检查，直接返回
    if (sql.trim() === 'SELECT 1') return [{ '1': 1 }];
    throw err;
  }
}

/**
 * 获取单条记录
 */
function queryOne(sql, params = []) {
  const sqliteSql = convertMySQLToSQLite(sql);
  try {
    const stmt = db.prepare(sqliteSql);
    return stmt.get(...params) || null;
  } catch (err) {
    throw err;
  }
}

/**
 * 插入并返回 lastInsertRowid
 */
function insert(sql, params = []) {
  const sqliteSql = convertMySQLToSQLite(sql);
  const stmt = db.prepare(sqliteSql);
  const result = stmt.run(...params);
  return result.lastInsertRowid;
}

/**
 * 事务支持
 */
function transaction(callback) {
  const tx = db.transaction(() => {
    return callback({
      query: (sql, params) => query(sql, params),
      queryOne: (sql, params) => queryOne(sql, params),
      insert: (sql, params) => insert(sql, params),
    });
  });
  return tx();
}

/**
 * MySQL → SQLite 语法转换
 * 处理常用的不兼容语法
 */
function convertMySQLToSQLite(sql) {
  let s = sql;

  // TIMESTAMP → TEXT (SQLite 没有 TIMESTAMP 类型)
  s = s.replace(/TIMESTAMP\s+DEFAULT\s+CURRENT_TIMESTAMP\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, 'TEXT DEFAULT CURRENT_TIMESTAMP');
  s = s.replace(/TIMESTAMP\s+DEFAULT\s+CURRENT_TIMESTAMP/gi, 'TEXT DEFAULT CURRENT_TIMESTAMP');
  s = s.replace(/TIMESTAMP/gi, 'TEXT');

  // AUTO_INCREMENT → AUTOINCREMENT (SQLite 用法)
  s = s.replace(/INT\s+AUTO_INCREMENT/gi, 'INTEGER');
  s = s.replace(/AUTO_INCREMENT/gi, '');

  // ENGINE=InnoDB ... → 移除
  s = s.replace(/ENGINE\s*=\s*InnoDB[^;]*/gi, '');
  s = s.replace(/DEFAULT\s+CHARSET\s*=\s*utf8mb4/gi, '');

  // ENUM → TEXT (SQLite 没有 ENUM)
  s = s.replace(/ENUM\([^)]+\)/gi, 'TEXT');

  // JSON → TEXT
  s = s.replace(/\bJSON\b/gi, 'TEXT');

  // DECIMAL(x,y) → REAL
  s = s.replace(/DECIMAL\(\d+,\d+\)/gi, 'REAL');

  // TINYINT(1) → INTEGER
  s = s.replace(/TINYINT\(\d+\)/gi, 'INTEGER');

  // VARCHAR(n) → TEXT
  s = s.replace(/VARCHAR\(\d+\)/gi, 'TEXT');

  // INDEX 语句单独处理（SQLite 不支持在 CREATE TABLE 内的 INDEX）
  s = s.replace(/,\s*INDEX\s+\w+\s*\([^)]+\)/gi, '');
  s = s.replace(/,\s*UNIQUE\s+KEY\s+\w+\s*\([^)]+\)/gi, '');
  s = s.replace(/,\s*FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+\w+\s*\([^)]+\)/gi, '');

  // MySQL 日期函数 → SQLite 等价（北京时间）
  s = s.replace(/NOW\(\)/gi, "datetime('now', 'localtime')");
  s = s.replace(/CURDATE\(\)/gi, "date('now', 'localtime')");
  s = s.replace(/DATE_SUB\(CURDATE\(\),\s*INTERVAL\s+(\?|\d+)\s+DAY\)/gi, "date('now', 'localtime', '-' || $1 || ' days')");
  s = s.replace(/DATE_SUB\(NOW\(\),\s*INTERVAL\s+(\d+)\s+(MINUTE|HOUR|DAY)\)/gi, (_, n, unit) => {
    return `datetime('now', 'localtime', '-${n} ${unit.toLowerCase()}s')`;
  });
  s = s.replace(/DATE_ADD\(NOW\(\),\s*INTERVAL\s+(\d+)\s+(MINUTE|HOUR|DAY)\)/gi, (_, n, unit) => {
    return `datetime('now', '+${n} ${unit.toLowerCase()}s')`;
  });
  s = s.replace(/TIMESTAMPDIFF\(HOUR,\s*datetime\('now'\),\s*expiry_time\)/gi,
    "CAST((julianday(expiry_time) - julianday(datetime('now', 'localtime'))) * 24 AS INTEGER)");
  s = s.replace(/TIMESTAMPDIFF\(HOUR,\s*NOW\(\),\s*expiry_time\)/gi,
    "CAST((julianday(expiry_time) - julianday(datetime('now', 'localtime'))) * 24 AS INTEGER)");

  // INSERT IGNORE → INSERT OR IGNORE
  s = s.replace(/INSERT\s+IGNORE/gi, 'INSERT OR IGNORE');

  // TEXT DEFAULT NULL → TEXT
  s = s.replace(/TEXT\s+DEFAULT\s+NULL/gi, 'TEXT');

  return s;
}

module.exports = { query, queryOne, insert, transaction, db: db };
