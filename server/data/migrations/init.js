/**
 * 数据库初始化迁移脚本（SQLite 版）
 * 执行方式: npm run migrate
 */
const db = require('../database');

const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    openid TEXT UNIQUE NOT NULL,
    union_id TEXT,
    nickname TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    session_key TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    current_rank TEXT DEFAULT '钻石3',
    rank_stars INTEGER DEFAULT 2,
    latest_kd REAL DEFAULT 1.82,
    headshot_rate REAL DEFAULT 24.3,
    win_rate REAL DEFAULT 56.0,
    avg_kills REAL DEFAULT 8.2,
    total_games INTEGER DEFAULT 0,
    peak_rank TEXT DEFAULT '',
    main_weapon TEXT DEFAULT 'AK47',
    sub_weapon TEXT DEFAULT 'M4A1',
    playstyle TEXT DEFAULT 'aggressive',
    preferred_maps TEXT,
    preferred_modes TEXT,
    total_diamonds INTEGER DEFAULT 0,
    monthly_spend REAL DEFAULT 0,
    spending_style TEXT DEFAULT 'smart',
    has_month_card INTEGER DEFAULT 0,
    call_name TEXT DEFAULT '主人',
    notification_level TEXT DEFAULT 'normal',
    meta TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS weapons_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    weapon_name TEXT NOT NULL,
    weapon_type TEXT DEFAULT 'rifle',
    quality TEXT DEFAULT 'normal',
    is_permanent INTEGER DEFAULT 0,
    expiry_time TEXT,
    status TEXT DEFAULT 'active',
    notified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS match_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    match_date TEXT NOT NULL,
    mode TEXT DEFAULT '排位赛',
    map_name TEXT DEFAULT '',
    result TEXT DEFAULT 'win',
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    headshots INTEGER DEFAULT 0,
    is_mvp INTEGER DEFAULT 0,
    weapon_used TEXT,
    duration INTEGER DEFAULT 0,
    rank_change INTEGER DEFAULT 0,
    data_source TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_id TEXT UNIQUE NOT NULL,
    messages TEXT,
    last_active TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    log_date TEXT NOT NULL,
    input_text TEXT DEFAULT '',
    intent_skill TEXT DEFAULT '',
    output_summary TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS memory_changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    field_path TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    source TEXT DEFAULT 'manual',
    confidence REAL DEFAULT 1.00,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS weapons_wiki (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    weapon_type TEXT DEFAULT '',
    tier TEXT DEFAULT 'T1',
    damage INTEGER DEFAULT 0,
    accuracy INTEGER DEFAULT 0,
    fire_rate INTEGER DEFAULT 0,
    recoil INTEGER DEFAULT 0,
    description TEXT,
    tips TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // Phase 2.5: 提醒表
  `CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  // Phase 2: 每日任务表
  `CREATE TABLE IF NOT EXISTS daily_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task_date TEXT NOT NULL,
    task_name TEXT NOT NULL,
    reward_desc TEXT DEFAULT '',
    reward_diamonds INTEGER DEFAULT 0,
    is_completed INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  // Phase 2.5: 待消费消息表（提醒写入对话列表用）
  `CREATE TABLE IF NOT EXISTS pending_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    msg_type TEXT DEFAULT 'reminder',
    chips TEXT DEFAULT '[]',
    extra TEXT DEFAULT '{}',
    is_consumed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
];

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid)',
  'CREATE INDEX IF NOT EXISTS idx_weapons_user_expiry ON weapons_inventory(user_id, expiry_time)',
  'CREATE INDEX IF NOT EXISTS idx_weapons_status ON weapons_inventory(status)',
  'CREATE INDEX IF NOT EXISTS idx_match_user_date ON match_records(user_id, match_date)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON chat_sessions(user_id, last_active)',
  'CREATE INDEX IF NOT EXISTS idx_logs_user_date ON daily_logs(user_id, log_date)',
  'CREATE INDEX IF NOT EXISTS idx_changelog_user_time ON memory_changelog(user_id, created_at)',
  // Phase 2.5 新索引
  'CREATE INDEX IF NOT EXISTS idx_reminders_user_status ON reminders(user_id, status, remind_at)',
  'CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_date ON daily_tasks(user_id, task_date)',
  'CREATE INDEX IF NOT EXISTS idx_pending_messages_user ON pending_messages(user_id, is_consumed)',
];

function migrate() {
  console.log('📦 开始创建数据库表...\n');

  for (const sql of TABLES) {
    try {
      db.query(sql);
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      console.log(`  ✅ ${match ? match[1] : '未知表'}`);
    } catch (err) {
      console.error(`  ❌ 建表失败:`, err.message);
    }
  }

  console.log('\n📇 创建索引...');
  for (const sql of INDEXES) {
    try {
      db.query(sql);
    } catch (err) {
      console.error('  ⚠️ 索引:', err.message);
    }
  }
  console.log('  ✅ 索引创建完成');

  // 插入百科种子数据
  console.log('\n🌱 插入种子数据...');
  const wikiData = [
    ['AK47', 'rifle', 'T0', 95, 60, 80, 95, '经典之王，威力巨大但后坐力高。', '前7发往下拉，8-15发往左下拉，15发后左右微调。'],
    ['M4A1', 'rifle', 'T0', 80, 90, 85, 60, '精准稳定，后坐力小适合新手。', '英雄级推荐：雷神/黑龙/无影M4A1。'],
    ['AWM', 'sniper', 'T0', 100, 95, 30, 80, '一枪毙命的拉栓式狙击。', '提前开镜，甩狙利用惯性，打完换位。'],
    ['MP5', 'smg', 'T1', 60, 70, 95, 40, '近战之王，射速极快。', '近距离压枪容易，配合快速移动。'],
    ['沙漠之鹰', 'pistol', 'T1', 85, 75, 40, 70, '副武器之王，爆头率极高。', '练好等于多一条命。'],
  ];

  const insertWiki = db.db.prepare(
    'INSERT OR IGNORE INTO weapons_wiki (name, weapon_type, tier, damage, accuracy, fire_rate, recoil, description, tips) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const insertMany = db.db.transaction((items) => {
    for (const item of items) {
      insertWiki.run(...item);
    }
  });

  try {
    insertMany(wikiData);
    console.log('  ✅ weapons_wiki 种子数据插入完成');
  } catch (err) {
    console.error('  ⚠️ 种子数据:', err.message);
  }

  console.log('\n🎉 数据库迁移完成！');
  console.log(`📁 数据库文件: ${require('path').join(__dirname, '..', 'zhijiclaw.db')}`);
}

migrate();
