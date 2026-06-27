const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');
const { logModAction } = require('../../moderation/autoMod');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server.')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to ban.').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the ban.').setRequired(false)
    )
    .addIntegerOption((option) =>
      option.setName('delete_messages')
        .setDescription('Delete messages from the last X days (0-7).')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['BanMembers'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Ban Members** permission.')], ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_messages') || 0;

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ embeds: [errorEmbed('You cannot ban this user due to role hierarchy.')], ephemeral: true });
    }

    if (!member?.bannable) {
      return interaction.reply({ embeds: [errorEmbed('I cannot ban this user. Check my permissions and role position.')], ephemeral: true });
    }

    try {
      await interaction.guild.members.ban(user.id, { reason: `${interaction.user.tag}: ${reason}`, deleteMessageSeconds: deleteDays * 86400 });

      const embed = successEmbed(`**${user.tag}** has been banned.\n**Reason:** ${reason}`);
      await interaction.reply({ embeds: [embed] });

      await logModAction(interaction.guild, {
        action: 'Ban',
        user,
        moderator: interaction.user,
        reason,
      });
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(`Failed to ban user: ${error.message}`)], ephemeral: true });
    }
  },
};
