const { EmbedBuilder } = require('discord.js');
const { getNewBans } = require('../database/anticheatDb');
const config = require('../config/client');
const logger = require('../config/logger');

const POLL_INTERVAL = 30_000;
let lastBanId = 0;
let intervalHandle = null;

function startBanPoller(client) {
  const channelId = config.anticheat?.banChannelId;
  if (!channelId) {
    logger.warn('ANTICHEAT_BAN_CHANNEL_ID not set — ban poller disabled');
    return;
  }

  logger.info('Ban poller started (interval: 30s)');

  intervalHandle = setInterval(async () => {
    try {
      const bans = await getNewBans(lastBanId);
      if (!bans || bans.length === 0) return;

      for (const ban of bans) {
        if (ban.ban_id > lastBanId) lastBanId = ban.ban_id;
        if (ban.unbanned) continue;

        const channel = client.channels.cache.get(channelId);
        if (!channel) continue;

        const embed = new EmbedBuilder()
          .setTitle('Anticheat Ban Detected')
          .setColor(0xED4245)
          .addFields(
            { name: 'Player', value: ban.player_name || 'Unknown', inline: true },
            { name: 'UUID', value: ban.player_uuid || 'N/A', inline: true },
            { name: 'Hack Type', value: ban.check_name || 'Unknown', inline: true },
            { name: 'Banned At', value: ban.banned_at ? new Date(ban.banned_at).toLocaleString() : 'Unknown', inline: true },
            { name: 'Expires', value: ban.expires_at ? new Date(ban.expires_at).toLocaleString() : 'Permanent', inline: true },
          )
          .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(err => logger.error('Ban post error:', err.message));
      }
    } catch (error) {
      logger.error('Ban poller error:', error.message);
    }
  }, POLL_INTERVAL);
}

function stopBanPoller() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startBanPoller, stopBanPoller };
