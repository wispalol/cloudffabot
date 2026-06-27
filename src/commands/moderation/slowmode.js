const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for the current channel.')
    .addIntegerOption((option) =>
      option.setName('seconds')
        .setDescription('Slowmode in seconds (0-21600, 0 to disable).')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ManageChannels'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Manage Channels** permission.')], ephemeral: true });
    }

    const seconds = interaction.options.getInteger('seconds');

    try {
      await interaction.channel.setRateLimitPerUser(seconds);

      const msg = seconds > 0
        ? `Slowmode set to **${seconds}** second(s).`
        : 'Slowmode has been disabled.';

      await interaction.reply({ embeds: [successEmbed(msg)] });
    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed(`Failed to set slowmode: ${error.message}`)],
        ephemeral: true,
      });
    }
  },
};
