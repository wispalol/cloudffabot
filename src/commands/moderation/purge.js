const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages (by amount or from a specific user).')
    .addIntegerOption((option) =>
      option.setName('amount')
        .setDescription('Number of messages to purge (1-100).')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption((option) =>
      option.setName('user')
        .setDescription('Only purge messages from this user.')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ManageMessages'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Manage Messages** permission.')], ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('user');

    try {
      let messages = await interaction.channel.messages.fetch({ limit: amount });

      if (targetUser) {
        messages = messages.filter((m) => m.author.id === targetUser.id);
      }

      const deleted = await interaction.channel.bulkDelete(messages, true);

      const reply = await interaction.reply({
        embeds: [successEmbed(
          targetUser
            ? `Purged **${deleted.size}** message(s) from **${targetUser.tag}**.`
            : `Purged **${deleted.size}** message(s).`
        )],
        fetchReply: true,
      });

      setTimeout(() => reply.delete().catch(() => {}), 3000);
    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed(`Failed to purge messages: ${error.message}`)],
        ephemeral: true,
      });
    }
  },
};
