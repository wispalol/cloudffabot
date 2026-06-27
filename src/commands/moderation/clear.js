const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear a specified number of messages from the channel.')
    .addIntegerOption((option) =>
      option.setName('amount')
        .setDescription('Number of messages to clear (1-100).')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ManageMessages'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Manage Messages** permission.')], ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount');

    try {
      const messages = await interaction.channel.bulkDelete(amount, true);

      const reply = await interaction.reply({
        embeds: [successEmbed(`Cleared **${messages.size}** message(s).`)],
        fetchReply: true,
      });

      setTimeout(() => reply.delete().catch(() => {}), 3000);
    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed(`Failed to clear messages: ${error.message}`)],
        ephemeral: true,
      });
    }
  },
};
