const { createEmbed } = require('../utils/embeds');
const config = require('../config/client');
const logger = require('../config/logger');

module.exports = {
  name: 'channelCreate',

  async execute(channel) {
    if (!channel.guild) return;

    const logChannel = channel.guild.channels.cache.get(config.logging.channelLogChannelId);
    if (!logChannel) return;

    const embed = createEmbed({
      title: '📝 Channel Created',
      color: config.embed.color.success,
      fields: [
        { name: 'Name', value: `${channel} (\`${channel.name}\`)`, inline: true },
        { name: 'Type', value: channelTypeToString(channel.type), inline: true },
        { name: 'Category', value: channel.parent ? channel.parent.name : 'None', inline: true },
        { name: 'ID', value: `\`${channel.id}\``, inline: true },
      ],
      timestamp: new Date(),
    });

    await logChannel.send({ embeds: [embed] }).catch((e) => logger.error('Channel create log error:', e));
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
