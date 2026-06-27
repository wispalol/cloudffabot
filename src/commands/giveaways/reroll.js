const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasRole } = require('../../utils/permissions');
const { getDb } = require('../../database/database');
const config = require('../../config/client');
const logger = require('../../config/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reroll')
    .setDescription('Reroll a giveaway winner.')
    .addStringOption((option) =>
      option.setName('message_id')
        .setDescription('The message ID of the giveaway to reroll.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName('winners')
        .setDescription('Number of new winners (default 1).')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)
    ),

  async execute(interaction) {
    if (!hasRole(interaction.member, [config.giveaways.staffRoleId]) &&
        !interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ embeds: [errorEmbed('You do not have permission to reroll giveaways.')], ephemeral: true });
    }

    const messageId = interaction.options.getString('message_id');
    const winnersCount = interaction.options.getInteger('winners') || 1;

    const { get } = getDb();
    const giveaway = get('SELECT * FROM giveaways WHERE message_id = ?', [messageId]);

    if (!giveaway) {
      return interaction.reply({ embeds: [errorEmbed('Giveaway not found.')], ephemeral: true });
    }

    if (!giveaway.ended) {
      return interaction.reply({ embeds: [errorEmbed('This giveaway has not ended yet.')], ephemeral: true });
    }

    const channel = interaction.guild.channels.cache.get(giveaway.channel_id);
    if (!channel) {
      return interaction.reply({ embeds: [errorEmbed('Giveaway channel not found.')], ephemeral: true });
    }

    try {
      // Get participants - in a real implementation, fetch from a giveaway_entries table
      const { all } = getDb();
      const participants = all(
        'SELECT DISTINCT author_id FROM ticket_messages WHERE ticket_id = ?',
        [messageId]
      );

      const eligibleUsers = participants || [];
      if (eligibleUsers.length < 1) {
        return interaction.reply({ embeds: [errorEmbed('No participants found for this giveaway.')], ephemeral: true });
      }

      const shuffled = [...eligibleUsers].sort(() => Math.random() - 0.5);
      const newWinners = [];
      for (let i = 0; i < Math.min(winnersCount, shuffled.length); i++) {
        newWinners.push(shuffled[i]);
      }

      const winnerMentions = newWinners.map((w) => `<@${w.author_id}>`).join(', ');

      await channel.send({
        content: `🎉 **Reroll!** Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`,
      });

      await interaction.reply({
        embeds: [successEmbed(`Rerolled **${winnersCount}** new winner(s) for **${giveaway.prize}**.`)],
      });
    } catch (error) {
      logger.error('Error rerolling giveaway:', error);
      await interaction.reply({ embeds: [errorEmbed('Failed to reroll giveaway.')], ephemeral: true });
    }
  },
};
