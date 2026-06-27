const { createEmbed } = require('../utils/embeds');
const config = require('../config/client');
const logger = require('../config/logger');

module.exports = {
  name: 'channelDelete',

  async execute(channel) {
    if (!channel.guild) return;

    const logChannel = channel.guild.channels.cache.get(config.logging.channelLogChannelId);
    if (!logChannel) return;

    const embed = createEmbed({
      title: '🗑️ Channel Deleted',
      color: config.embed.color.error,
      fields: [
        { name: 'Name', value: `#${channel.name}`, inline: true },
        { name: 'Type', value: channelTypeToString(channel.type), inline: true },
        { name: 'ID', value: `\`${channel.id}\``, inline: true },
      ],
      timestamp: new Date(),
    });

    await logChannel.send({ embeds: [embed] }).catch((e) => logger.error('Channel delete log error:', e));
  },
};

function channelTypeToString(type) {
  const types = {
    0: 'Text',
    2: 'Voice',
    4: 'Category',
    5: 'Announcement',
    13: 'Stage',
    15: 'Forum',
    16: 'Media',
  };
  return types[type] || 'Unknown';
}
