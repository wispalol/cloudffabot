const { createEmbed } = require('../utils/embeds');
const config = require('../config/client');
const logger = require('../config/logger');

module.exports = {
  name: 'voiceStateUpdate',

  async execute(oldState, newState) {
    try {
      const logChannel = newState.guild.channels.cache.get(config.logging.voiceLogChannelId);
      if (!logChannel) return;

      const member = newState.member;
      if (!member || member.user.bot) return;

      // Joined a voice channel
      if (!oldState.channelId && newState.channelId) {
        const embed = createEmbed({
          title: '🔊 Voice Join',
          color: config.embed.color.success,
          fields: [
            { name: 'User', value: `${member} (\`${member.id}\`)`, inline: true },
            { name: 'Channel', value: `${newState.channel}`, inline: true },
          ],
          timestamp: new Date(),
        });
        await logChannel.send({ embeds: [embed] });
      }

      // Left a voice channel
      if (oldState.channelId && !newState.channelId) {
        const embed = createEmbed({
          title: '🔇 Voice Leave',
          color: config.embed.color.error,
          fields: [
            { name: 'User', value: `${member} (\`${member.id}\`)`, inline: true },
            { name: 'Channel', value: `${oldState.channel}`, inline: true },
          ],
          timestamp: new Date(),
        });
        await logChannel.send({ embeds: [embed] });
      }

      // Moved between voice channels
      if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const embed = createEmbed({
          title: '🔀 Voice Moved',
          color: config.embed.color.warning,
          fields: [
            { name: 'User', value: `${member} (\`${member.id}\`)`, inline: true },
            { name: 'From', value: `${oldState.channel}`, inline: true },
            { name: 'To', value: `${newState.channel}`, inline: true },
          ],
          timestamp: new Date(),
        });
        await logChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      logger.error('Error in voiceStateUpdate:', error);
    }
  },
};
