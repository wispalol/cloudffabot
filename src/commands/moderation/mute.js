const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');
const { logModAction } = require('../../moderation/autoMod');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a member (assigns the muted role).')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to mute.').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the mute.').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ModerateMembers'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Moderate Members** permission.')], ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      return interaction.reply({ embeds: [errorEmbed('User not found in the server.')], ephemeral: true });
    }

    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ embeds: [errorEmbed('You cannot mute this user due to role hierarchy.')], ephemeral: true });
    }

    const muteRoleId = config.moderation.muteRoleId;
    if (!muteRoleId) {
      return interaction.reply({ embeds: [errorEmbed('Mute role not configured. Set MUTE_ROLE_ID in .env')], ephemeral: true });
    }

    const muteRole = interaction.guild.roles.cache.get(muteRoleId);
    if (!muteRole) {
      return interaction.reply({ embeds: [errorEmbed('Mute role not found on this server.')], ephemeral: true });
    }

    try {
      await member.roles.add(muteRole, `${interaction.user.tag}: ${reason}`);

      const embed = successEmbed(`**${user.tag}** has been muted.\n**Reason:** ${reason}`);
      await interaction.reply({ embeds: [embed] });

      await logModAction(interaction.guild, {
        action: 'Mute',
        user,
        moderator: interaction.user,
        reason,
      });
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(`Failed to mute user: ${error.message}`)], ephemeral: true });
    }
  },
};
