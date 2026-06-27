const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock the current channel (prevents @everyone from sending messages).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ManageChannels'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Manage Channels** permission.')], ephemeral: true });
    }

    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
        SendMessages: false,
      });

      await interaction.reply({
        embeds: [successEmbed('This channel has been locked.')],
      });
    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed(`Failed to lock channel: ${error.message}`)],
        ephemeral: true,
      });
    }
  },
};
