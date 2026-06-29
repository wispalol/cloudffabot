const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const config = require('../config/client');

let db;

async function connectDatabase() {
  const SQL = await initSqlJs();
  const dbPath = path.resolve(config.database.path);

  // Load existing database file or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  createTables();

  // Save the database to disk periodically
  saveDatabase();

  return db;
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT UNIQUE NOT NULL,
      channel_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      claimed_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      transcript_url TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS moderation_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      reason TEXT,
      duration TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      channel_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      channel_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      prize TEXT NOT NULL,
      winners INTEGER DEFAULT 1,
      end_time DATETIME NOT NULL,
      ended INTEGER DEFAULT 0,
      host_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      channel_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS auto_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      UNIQUE(guild_id, role_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS verification (
      user_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      verified INTEGER DEFAULT 0,
      code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_locales (
      user_id TEXT PRIMARY KEY,
      locale TEXT NOT NULL DEFAULT 'en',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ticket_bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      banned_until DATETIME NOT NULL,
      reason TEXT DEFAULT 'Safety policy violation',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  saveDatabase();
}

function saveDatabase() {
  try {
    const dbPath = path.resolve(config.database.path);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (error) {
    logger.error('Failed to save database:', error);
  }
}

/**
 * Helper: run a query with parameters and return the affected row count.
 */
function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  return db.getRowsModified();
}

/**
 * Helper: get a single row as an object.
 */
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const result = stmt.getAsObject();
    stmt.free();
    return result;
  }
  stmt.free();
  return undefined;
}

/**
 * Helper: get all rows as an array of objects.
 */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Helper: insert and return last insert ID.
 */
function insert(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  // Get the last insert id via a query
  const result = get('SELECT last_insert_rowid() as id');
  return result ? result.id : null;
}

function getDb() {
  if (!db) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  return { db, run, get, all, insert, save: saveDatabase };
}

function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    logger.info('Database connection closed.');
  }
}

module.exports = { connectDatabase, getDb, closeDatabase };
