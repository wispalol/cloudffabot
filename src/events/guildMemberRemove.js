const { handleGuildMemberRemove } = require('../welcome/welcome');
const config = require('../config/client');
const { createEmbed } = require('../utils/embeds');
const logger = require('../config/logger');

module.exports = {
  name: 'guildMemberRemove',

  async execute(member) {
    try {
      await handleGuildMemberRemove(member);

      // Log member leave
      const memberLogChannel = member.guild.channels.cache.get(config.logging.memberLogChannelId);
      if (memberLogChannel) {
        const embed = createEmbed({
          title: `${config.emoji.leave} Member Left`,
          color: config.embed.color.error,
          thumbnail: member.user.displayAvatarURL({ size: 128 }),
          fields: [
            { name: 'User', value: `${member.user} (\`${member.user.tag}\`)`, inline: true },
            { name: 'ID', value: `\`${member.id}\``, inline: true },
            { name: 'Joined', value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown', inline: true },
          ],
          timestamp: new Date(),
        });
        await memberLogChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      logger.error('Error in guildMemberRemove:', error);
    }
  },
};
