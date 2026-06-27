const config = require('../config/client');
const logger = require('../config/logger');
const { getDb } = require('../database/database');
const { createEmbed } = require('../utils/embeds');

/**
 * Rate-limit tracking for anti-spam.
 * Maps guildId -> userId -> { count, timer }
 */
const spamTracker = new Map();

/**
 * Anti-raid join tracking.
 * Maps guildId -> array of timestamps for recent joins.
 */
const joinTracker = new Map();

/**
 * Known scam/invite link patterns (simplified).
 */
const SCAM_DOMAINS = [
  'discord-nitro.xyz', 'steamcommunity.ru', 'free-nitro.com',
  'discordgift.site', 'nitro-gift.ru', 'gift-nitro.com',
  'steamcommunity.com/gift', 'free-steam-games.com',
];

/**
 * Cleans up spam tracker entries periodically.
 */
setInterval(() => {
  const now = Date.now();
  for (const [guildId, users] of spamTracker) {
    for (const [userId, data] of users) {
      // Remove entries older than the interval
      data.timestamps = data.timestamps.filter(
        (t) => now - t < config.autoMod.antiSpam.intervalMs
      );
      if (data.timestamps.length === 0) {
        users.delete(userId);
      }
    }
    if (users.size === 0) {
      spamTracker.delete(guildId);
    }
  }
}, 30000);

/**
 * Checks a message against all auto-mod rules.
 * Returns an object with { flagged, reason } if a rule is triggered, or null.
 */
function checkAutoMod(message) {
  if (!message.guild || message.author.bot) return null;
  if (message.member?.roles?.cache?.has(config.ticket.staffRoleId)) return null;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const content = message.content.toLowerCase();

  // ─── Anti-Spam ────────────────────────────────────────
  if (config.autoMod.antiSpam.enabled) {
    if (!spamTracker.has(guildId)) spamTracker.set(guildId, new Map());
    const guildTracker = spamTracker.get(guildId);
    if (!guildTracker.has(userId)) {
      guildTracker.set(userId, { timestamps: [] });
    }
    const userData = guildTracker.get(userId);
    userData.timestamps.push(Date.now());

    const recent = userData.timestamps.filter(
      (t) => Date.now() - t < config.autoMod.antiSpam.intervalMs
    );
    userData.timestamps = recent;

    if (recent.length > config.autoMod.antiSpam.maxMessages) {
      return { flagged: true, reason: 'Anti-Spam: Too many messages sent too quickly.' };
    }
  }

  // ─── Anti-Scam Links ──────────────────────────────────
  if (config.autoMod.antiScam.enabled) {
    for (const domain of SCAM_DOMAINS) {
      if (content.includes(domain)) {
        return { flagged: true, reason: `Anti-Scam: Suspicious link detected (${domain}).` };
      }
    }
  }

  // ─── Anti-Mass-Mention ────────────────────────────────
  if (config.autoMod.antiMassMention.enabled) {
    const mentionCount = (message.content.match(/<@[!&]?\d+>/g) || []).length;
    if (mentionCount > config.autoMod.antiMassMention.limit) {
      return { flagged: true, reason: `Anti-Mass-Mention: Exceeded ${config.autoMod.antiMassMention.limit} mentions.` };
    }
  }

  // ─── Bad Word Filter ──────────────────────────────────
  if (config.autoMod.badWordFilter.enabled) {
    for (const word of config.autoMod.badWordFilter.words) {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(content)) {
        return { flagged: true, reason: `Bad Word Filter: Inappropriate language detected.` };
      }
    }
  }

  // ─── Anti-Invite Links ────────────────────────────────
  if (config.autoMod.antiInvite.enabled) {
    const inviteRegex = /(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/gi;
    if (inviteRegex.test(content)) {
      // Allow invites to the current server
      if (message.content.includes(`discord.gg/${message.guild.vanityURLCode}`) ||
          message.content.includes(`discord.gg/${message.guild.id}`)) {
        // Skip — it's this server's invite
      } else {
        return { flagged: true, reason: 'Anti-Invite: Discord invite links are not allowed.' };
      }
    }
  }

  return null;
}

/**
 * Handles the auto-mod action: deletes the message and warns the user.
 */
async function handleAutoMod(message, result) {
  try {
    await message.delete();
  } catch {
    // Could not delete — might not have permission
  }

  // DM the user
  try {
    const embed = createEmbed({
      title: `${config.emoji.warning} Auto-Moderation`,
      description: `Your message in **${message.guild.name}** was removed.\n**Reason:** ${result.reason}`,
      color: config.embed.color.warning,
    });
    await message.author.send({ embeds: [embed] });
  } catch {
    // Cannot DM
  }

  // Log to mod-log channel
  const modLogChannel = message.guild.channels.cache.get(config.moderation.logChannelId);
  if (modLogChannel) {
    const logEmbed = createEmbed({
      title: `${config.emoji.mod} Auto-Mod Action`,
      color: config.embed.color.warning,
      fields: [
        { name: 'User', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
        { name: 'Channel', value: `${message.channel}`, inline: true },
        { name: 'Reason', value: result.reason, inline: false },
        { name: 'Content', value: message.content ? `\`\`\`${message.content.slice(0, 1000)}\`\`\`` : 'N/A', inline: false },
      ],
      timestamp: new Date(),
    });
    await modLogChannel.send({ embeds: [logEmbed] });
  }

  logger.info(`Auto-mod triggered: ${result.reason} for ${message.author.tag} in ${message.guild.name}`);
}

/**
 * Log a moderation action to the mod-log channel and database.
 */
async function logModAction(guild, { action, user, moderator, reason, duration }) {
  const { run } = getDb();
  run(
    'INSERT INTO moderation_actions (user_id, guild_id, moderator_id, action_type, reason, duration) VALUES (?, ?, ?, ?, ?, ?)',
    [user.id, guild.id, moderator.id, action, reason || null, duration || null]
  );

  const logChannel = guild.channels.cache.get(config.moderation.logChannelId);
  if (!logChannel) return;

  const embed = createEmbed({
    title: `${config.emoji.mod} ${action}`,
    color: action === 'Ban' || action === 'Kick' ? config.embed.color.error : config.embed.color.warning,
    fields: [
      { name: 'User', value: `${user} (\`${user.id}\`)`, inline: true },
      { name: 'Moderator', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: false },
      ...(duration ? [{ name: 'Duration', value: duration, inline: true }] : []),
    ],
    timestamp: new Date(),
  });

  await logChannel.send({ embeds: [embed] });
}

/**
 * Checks if a guild is currently being raided based on join rate.
 */
function isRaid(guildId) {
  if (!config.autoMod.antiRaid.enabled) return false;

  if (!joinTracker.has(guildId)) {
    joinTracker.set(guildId, []);
  }

  const joins = joinTracker.get(guildId);
  const now = Date.now();

  // Remove old entries outside the time window
  const recent = joins.filter((t) => now - t < config.autoMod.antiRaid.timeWindowMs);
  joinTracker.set(guildId, recent);

  return recent.length >= config.autoMod.antiRaid.joinThreshold;
}

/**
 * Records a join event for anti-raid detection.
 */
function recordJoin(guildId) {
  if (!joinTracker.has(guildId)) {
    joinTracker.set(guildId, []);
  }
  joinTracker.get(guildId).push(Date.now());
}

module.exports = {
  checkAutoMod,
  handleAutoMod,
  logModAction,
  isRaid,
  recordJoin,
};
