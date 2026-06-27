const { createEmbed } = require('../utils/embeds');
const config = require('../config/client');
const logger = require('../config/logger');

module.exports = {
  name: 'messageUpdate',

  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const logChannel = newMessage.guild.channels.cache.get(config.logging.messageLogChannelId);
    if (!logChannel) return;

    const embed = createEmbed({
      title: '✏️ Message Edited',
      color: config.embed.color.warning,
      fields: [
        { name: 'Author', value: `${newMessage.author} (\`${newMessage.author.id}\`)`, inline: true },
        { name: 'Channel', value: `${newMessage.channel}`, inline: true },
        { name: 'Before', value: oldMessage.content ? `\`\`\`${oldMessage.content.slice(0, 1000)}\`\`\`` : 'N/A', inline: false },
        { name: 'After', value: newMessage.content ? `\`\`\`${newMessage.content.slice(0, 1000)}\`\`\`` : 'N/A', inline: false },
        { name: 'Jump', value: `[Click here](${newMessage.url})`, inline: false },
      ],
      timestamp: new Date(),
    });

    await logChannel.send({ embeds: [embed] }).catch((e) => logger.error('Message update log error:', e));
  },
};
