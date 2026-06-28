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

async function closeAnticheatDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { connectAnticheatDb, getNewBans, closeAnticheatDb };
