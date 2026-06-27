const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');
const { logModAction } = require('../../moderation/autoMod');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member for a specific duration.')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to timeout.').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('duration')
        .setDescription('Duration (e.g. 10m, 1h, 1d, 7d). Max 28 days.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the timeout.').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ModerateMembers'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Moderate Members** permission.')], ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      return interaction.reply({ embeds: [errorEmbed('User not found in the server.')], ephemeral: true });
    }

    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ embeds: [errorEmbed('You cannot timeout this user due to role hierarchy.')], ephemeral: true });
    }

    if (!member.moderatable) {
      return interaction.reply({ embeds: [errorEmbed('I cannot timeout this user.')], ephemeral: true });
    }

    const durationMs = ms(durationStr);
    if (!durationMs || durationMs > 28 * 24 * 60 * 60 * 1000) {
      return interaction.reply({ embeds: [errorEmbed('Invalid duration. Max 28 days. Use format like: 10m, 1h, 1d, 7d.')], ephemeral: true });
    }

    try {
      await member.timeout(durationMs, `${interaction.user.tag}: ${reason}`);

      const embed = successEmbed(`**${user.tag}** has been timed out for **${durationStr}**.\n**Reason:** ${reason}`);
      await interaction.reply({ embeds: [embed] });

      await logModAction(interaction.guild, {
        action: 'Timeout',
        user,
        moderator: interaction.user,
        reason,
        duration: durationStr,
      });
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(`Failed to timeout user: ${error.message}`)], ephemeral: true });
    }
  },
};
