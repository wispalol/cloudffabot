const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock the current channel (allows @everyone to send messages).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ManageChannels'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Manage Channels** permission.')], ephemeral: true });
    }

    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
        SendMessages: null,
      });

      await interaction.reply({
        embeds: [successEmbed('This channel has been unlocked.')],
      });
    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed(`Failed to unlock channel: ${error.message}`)],
        ephemeral: true,
      });
    }
  },
};
