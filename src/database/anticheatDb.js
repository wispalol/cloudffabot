const mysql = require('mysql2/promise');
const logger = require('../config/logger');

let pool = null;

async function connectAnticheatDb() {
  const host = process.env.ANTICHEAT_DB_HOST;
  const port = parseInt(process.env.ANTICHEAT_DB_PORT, 10) || 3306;
  const user = process.env.ANTICHEAT_DB_USER;
  const password = process.env.ANTICHEAT_DB_PASSWORD;
  const database = process.env.ANTICHEAT_DB_NAME;

  if (!host || !user || !password || !database) {
    logger.warn('Anticheat DB credentials not set — skipping MySQL connection');
    return null;
  }

  try {
    pool = mysql.createPool({ host, port, user, password, database, waitForConnections: true, connectionLimit: 2, queueLimit: 0 });
    const conn = await pool.getConnection();
    conn.release();
    logger.info('Connected to anticheat MySQL database (read-only).');
    return pool;
  } catch (error) {
    logger.error('Failed to connect to anticheat database:', error.message);
    return null;
  }
}

async function getNewBans(lastCheckId) {
  if (!pool) return [];
  try {
    const [rows] = await pool.query(
      'SELECT ban_id, player_name, player_uuid, check_name, banned_at, expires_at, unbanned FROM opmcheck_bans WHERE ban_id > ? ORDER BY ban_id ASC LIMIT 50',
      [lastCheckId]
    );
    return rows;
  } catch (error) {
    logger.error('Error querying anticheat bans:', error.message);
    return [];
  }
}

async function lookupAnticheatBan(query) {
  if (!pool) return null;
  try {
    const trimmed = query.toString().trim();
    if (!trimmed) return null;

    // Search by player_name (case-insensitive)
    let [rows] = await pool.query(
      'SELECT * FROM opmcheck_bans WHERE LOWER(player_name) = LOWER(?) ORDER BY ban_id DESC LIMIT 1',
      [trimmed]
    );
    if (rows.length > 0) return rows[0];

    // Search by player_uuid (with or without dashes)
    const cleanUuid = trimmed.replace(/-/g, '');
    if (cleanUuid.length === 32 && /^[0-9a-f]{32}$/i.test(cleanUuid)) {
      [rows] = await pool.query(
        'SELECT * FROM opmcheck_bans WHERE REPLACE(player_uuid, "-", "") = ? ORDER BY ban_id DESC LIMIT 1',
        [cleanUuid]
      );
      if (rows.length > 0) return rows[0];
    }

    // Search by ban_id (string format: XX-XXXX-XXXX-N or plain integer)
    [rows] = await pool.query(
      'SELECT * FROM opmcheck_bans WHERE ban_id = ? ORDER BY ban_id DESC LIMIT 1',
      [trimmed]
    );
    if (rows.length > 0) return rows[0];

    // Search by ban_id as integer fallback
    const banId = parseInt(trimmed, 10);
    if (!isNaN(banId)) {
      [rows] = await pool.query(
        'SELECT * FROM opmcheck_bans WHERE ban_id = ?',
        [banId]
      );
      if (rows.length > 0) return rows[0];
    }

    return null;
  } catch (error) {
    logger.error('Error looking up anticheat ban:', error.message);
    return null;
  }
}

async function closeAnticheatDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { connectAnticheatDb, getNewBans, lookupAnticheatBan, closeAnticheatDb };
