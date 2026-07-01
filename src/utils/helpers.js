const config = require('../config/client');

/**
 * Formats a Date object or timestamp string into a readable format.
 */
function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  });
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

/**
 * Truncates a string to a given length.
 */
function truncate(str, maxLength = 100) {
  if (!str) return '';
  return str.length > maxLength ? str.slice(0, maxLength - 3) + '...' : str;
}

/**
 * Sanitises a string for use in channel names (lowercase, no spaces).
 */
function sanitizeChannelName(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32) || 'channel';
}

/**
 * Returns the emoji for a ticket type.
 */
function getTicketTypeEmoji(type) {
  const emojis = {
    opmcheck_premium: '⚡',
    bug_report: '🐛',
    staff_report: '🛡️',
    general_support: '❓',
    purchase_support: '💳',
    partnership_request: '🤝',
    discord_report: '📱',
    whitelist_application: '📋',
    other: '📌',
  };
  return emojis[type] || '🎫';
}

/**
 * Returns the display name for a ticket type.
 */
function getTicketTypeName(type) {
  const names = {
    opmcheck_premium: 'Opmcheck Premium',
    bug_report: 'Bug Report',
    staff_report: 'Staff Report',
    general_support: 'General Support',
    purchase_support: 'Purchase Support',
    partnership_request: 'Partnership Request',
    discord_report: 'Discord Report',
    whitelist_application: 'Whitelist Application',
    other: 'Other',
  };
  return names[type] || 'Unknown';
}

module.exports = {
  formatDate,
  formatDuration,
  truncate,
  sanitizeChannelName,
  getTicketTypeEmoji,
  getTicketTypeName,
};
