const { createEmbed } = require('../utils/embeds');
const config = require('../config/client');
const logger = require('../config/logger');

module.exports = {
  name: 'messageDelete',

  async execute(message) {
    // Ignore DMs, bots, and empty content
    if (!message.guild || message.author?.bot) return;
    if (!message.content && message.attachments.size === 0) return;

    const logChannel = message.guild.channels.cache.get(config.logging.messageLogChannelId);
    if (!logChannel) return;

    const embed = createEmbed({
      title: '🗑️ Message Deleted',
      color: config.embed.color.error,
      fields: [
        { name: 'Author', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
        { name: 'Channel', value: `${message.channel} (\`${message.channel.id}\`)`, inline: true },
        { name: 'Content', value: message.content ? `\`\`\`${message.content.slice(0, 1000)}\`\`\`` : 'N/A', inline: false },
        ...(message.attachments.size > 0
          ? [{ name: 'Attachments', value: message.attachments.map((a) => `[${a.name}](${a.url})`).join('\n'), inline: false }]
          : []),
      ],
      timestamp: new Date(),
    });

    await logChannel.send({ embeds: [embed] }).catch((e) => logger.error('Message delete log error:', e));
  },
};
