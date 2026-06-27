const config = require('../config/client');
const logger = require('../config/logger');
const { createEmbed } = require('../utils/embeds');
const { getDb } = require('../database/database');

/**
 * Handles a new member joining the guild.
 * - Sends a welcome embed
 * - Assigns auto-role
 * - Checks account age
 * - Sends verification prompt if enabled
 */
async function handleGuildMemberAdd(member) {
  const guild = member.guild;

  // ─── Welcome Embed ────────────────────────────────────
  const welcomeChannel = guild.channels.cache.get(config.welcome.channelId);
  if (welcomeChannel) {
    const memberCount = guild.memberCount;

    const embed = createEmbed({
      title: `${config.emoji.welcome} Welcome!`,
      description: `Welcome to **${guild.name}**, ${member}!`,
      color: config.embed.color.success,
      thumbnail: member.user.displayAvatarURL({ size: 128 }),
      fields: [
        { name: 'Member', value: `${member} (\`${member.user.tag}\`)`, inline: true },
        { name: 'Joined', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
        { name: 'Member Count', value: `You are member **#${memberCount}**`, inline: true },
      ],
      timestamp: new Date(),
    });

    await welcomeChannel.send({ embeds: [embed] });
  }

  // ─── Auto-Role ────────────────────────────────────────
  if (config.welcome.autoRoleId) {
    const role = guild.roles.cache.get(config.welcome.autoRoleId);
    if (role) {
      try {
        await member.roles.add(role);
      } catch (error) {
        logger.error(`Failed to assign auto-role to ${member.id}:`, error);
      }
    }
  }

  // ─── Account Age Detection ────────────────────────────
  const accountAge = Date.now() - member.user.createdTimestamp;
  const MIN_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

  if (accountAge < MIN_AGE) {
    const modLogChannel = guild.channels.cache.get(config.moderation.logChannelId);
    if (modLogChannel) {
      const embed = createEmbed({
        title: `${config.emoji.warning} New Account Detected`,
        color: config.embed.color.warning,
        fields: [
          { name: 'User', value: `${member} (\`${member.id}\`)`, inline: true },
          { name: 'Account Age', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        ],
        timestamp: new Date(),
      });
      await modLogChannel.send({ embeds: [embed] });
    }
  }

  // ─── Verification System ──────────────────────────────
  if (config.welcome.verificationEnabled) {
    const verifiedRole = guild.roles.cache.get(config.welcome.verifiedRoleId);
    if (verifiedRole) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { run } = getDb();

      run(
        'INSERT OR REPLACE INTO verification (user_id, guild_id, verified, code) VALUES (?, ?, 0, ?)',
        [member.id, guild.id, code]
      );

      try {
        const verifyEmbed = createEmbed({
          title: `${config.emoji.welcome} Verification Required`,
          description:
            `Welcome to **${guild.name}**!\n\n` +
            `To access the server, please verify by using the command:\n\`\`\`/verify ${code}\`\`\`\n` +
            `This code expires in **10 minutes**.\n\n` +
            `If you did not join this server, please ignore this message.`,
          color: config.embed.color.warning,
        });
        await member.send({ embeds: [verifyEmbed] });

        // Remove unverified role after 10 minutes
        setTimeout(async () => {
          const currentMember = await guild.members.fetch(member.id).catch(() => null);
          if (currentMember && !currentMember.roles.cache.has(verifiedRole.id)) {
            await currentMember.kick('Failed to verify in time.').catch(() => {});
            run('DELETE FROM verification WHERE user_id = ?', [member.id]);
          }
        }, 10 * 60 * 1000);
      } catch {
        // Cannot DM — skip verification
      }
    }
  }
}

/**
 * Handles a member leaving the guild.
 */
async function handleGuildMemberRemove(member) {
  const leaveChannel = member.guild.channels.cache.get(config.welcome.leaveChannelId);
  if (!leaveChannel) return;

  const embed = createEmbed({
    title: `${config.emoji.leave} Member Left`,
    description: `${member.user.tag} has left the server.`,
    color: config.embed.color.error,
    thumbnail: member.user.displayAvatarURL({ size: 128 }),
    fields: [
      { name: 'Member', value: `${member} (\`${member.user.tag}\`)`, inline: true },
      { name: 'Joined', value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown', inline: true },
      { name: 'Member Count', value: `**${member.guild.memberCount}** members remaining`, inline: true },
    ],
    timestamp: new Date(),
  });

  await leaveChannel.send({ embeds: [embed] });
}

module.exports = { handleGuildMemberAdd, handleGuildMemberRemove };
