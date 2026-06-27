const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');
const { logModAction } = require('../../moderation/autoMod');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server.')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to kick.').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the kick.').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['KickMembers'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Kick Members** permission.')], ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      return interaction.reply({ embeds: [errorEmbed('That user is not in the server.')], ephemeral: true });
    }

    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ embeds: [errorEmbed('You cannot kick this user due to role hierarchy.')], ephemeral: true });
    }

    if (!member.kickable) {
      return interaction.reply({ embeds: [errorEmbed('I cannot kick this user.')], ephemeral: true });
    }

    try {
      await member.kick(`${interaction.user.tag}: ${reason}`);

      const embed = successEmbed(`**${user.tag}** has been kicked.\n**Reason:** ${reason}`);
      await interaction.reply({ embeds: [embed] });

      await logModAction(interaction.guild, {
        action: 'Kick',
        user,
        moderator: interaction.user,
        reason,
      });
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(`Failed to kick user: ${error.message}`)], ephemeral: true });
    }
  },
};
