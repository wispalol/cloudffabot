const { handleGuildMemberAdd } = require('../welcome/welcome');
const { recordJoin } = require('../moderation/autoMod');
const config = require('../config/client');
const { createEmbed } = require('../utils/embeds');
const logger = require('../config/logger');

module.exports = {
  name: 'guildMemberAdd',

  async execute(member) {
    try {
      // Record join for anti-raid detection
      recordJoin(member.guild.id);

      // Handle welcome
      await handleGuildMemberAdd(member);

      // Log member join
      const memberLogChannel = member.guild.channels.cache.get(config.logging.memberLogChannelId);
      if (memberLogChannel) {
        const embed = createEmbed({
          title: `${config.emoji.welcome} Member Joined`,
          color: config.embed.color.success,
          thumbnail: member.user.displayAvatarURL({ size: 128 }),
          fields: [
            { name: 'User', value: `${member} (\`${member.user.tag}\`)`, inline: true },
            { name: 'ID', value: `\`${member.id}\``, inline: true },
            { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
          ],
          timestamp: new Date(),
        });
        await memberLogChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      logger.error('Error in guildMemberAdd:', error);
    }
  },
};
