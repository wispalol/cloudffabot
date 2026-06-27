const { createEmbed } = require('../utils/embeds');
const config = require('../config/client');
const logger = require('../config/logger');

module.exports = {
  name: 'guildMemberUpdate',

  async execute(oldMember, newMember) {
    try {
      const logChannel = newMember.guild.channels.cache.get(config.logging.memberLogChannelId);
      if (!logChannel) return;

      // ─── Nickname Change ──────────────────────────────
      if (oldMember.nickname !== newMember.nickname) {
        const embed = createEmbed({
          title: '✏️ Nickname Changed',
          color: config.embed.color.warning,
          fields: [
            { name: 'User', value: `${newMember} (\`${newMember.id}\`)`, inline: true },
            { name: 'Before', value: oldMember.nickname || 'None', inline: true },
            { name: 'After', value: newMember.nickname || 'None', inline: true },
          ],
          timestamp: new Date(),
        });
        await logChannel.send({ embeds: [embed] });
      }

      // ─── Role Changes ─────────────────────────────────
      const addedRoles = newMember.roles.cache.filter(
        (role) => !oldMember.roles.cache.has(role.id) && role.id !== newMember.guild.id
      );
      const removedRoles = oldMember.roles.cache.filter(
        (role) => !newMember.roles.cache.has(role.id) && role.id !== newMember.guild.id
      );

      if (addedRoles.size > 0 || removedRoles.size > 0) {
        const embed = createEmbed({
          title: '🔄 Roles Updated',
          color: config.embed.color.primary,
          fields: [
            { name: 'User', value: `${newMember} (\`${newMember.id}\`)`, inline: true },
            ...(addedRoles.size > 0
              ? [{ name: 'Added Roles', value: [...addedRoles.values()].map((r) => r.toString()).join(', '), inline: false }]
              : []),
            ...(removedRoles.size > 0
              ? [{ name: 'Removed Roles', value: [...removedRoles.values()].map((r) => r.toString()).join(', '), inline: false }]
              : []),
          ],
          timestamp: new Date(),
        });
        await logChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      logger.error('Error in guildMemberUpdate:', error);
    }
  },
};
