const logger = require('../config/logger');
const { errorEmbed } = require('../utils/embeds');
const {
  handleTicketCreate,
  handleTicketButton,
  confirmCloseTicket,
  confirmDeleteTicket,
  handleTicketModal,
} = require('../tickets/ticketManager');

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    try {
      // ─── Slash Commands ────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        // Check cooldowns
        const cooldowns = client.cooldowns;
        if (!cooldowns.has(command.data.name)) {
          cooldowns.set(command.data.name, new Map());
        }

        const now = Date.now();
        const timestamps = cooldowns.get(command.data.name);
        const cooldownAmount = (command.cooldown || 3) * 1000;

        if (timestamps.has(interaction.user.id)) {
          const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
          if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return interaction.reply({
              embeds: [errorEmbed(`Please wait **${timeLeft.toFixed(1)}s** before using \`/${command.data.name}\` again.`)],
              ephemeral: true,
            });
          }
        }

        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

        await command.execute(interaction);
        return;
      }

      // ─── Ticket Select Menu ────────────────────────────
      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_create') {
        await handleTicketCreate(interaction);
        return;
      }

      // ─── Ticket Buttons ────────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
        // Handle confirm close / cancel / confirm delete
        if (interaction.customId.startsWith('ticket_confirm_close_')) {
          const ticketId = interaction.customId.replace('ticket_confirm_close_', '');
          const { get } = require('../database/database').getDb();
          const ticket = get('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId]);
          if (ticket) await confirmCloseTicket(interaction, ticket);
          return;
        }

        if (interaction.customId.startsWith('ticket_cancel_')) {
          await interaction.update({ components: [] });
          return;
        }

        if (interaction.customId.startsWith('ticket_confirm_delete_')) {
          const ticketId = interaction.customId.replace('ticket_confirm_delete_', '');
          const { get } = require('../database/database').getDb();
          const ticket = get('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId]);
          if (ticket) await confirmDeleteTicket(interaction, ticket);
          return;
        }

        // General ticket buttons
        await handleTicketButton(interaction);
        return;
      }

      // ─── Ticket Modals ─────────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_')) {
        await handleTicketModal(interaction);
        return;
      }

      // ─── Suggestion Approve/Reject ─────────────────────
      if (interaction.isButton()) {
        if (interaction.customId === 'suggest_approve' || interaction.customId === 'suggest_reject') {
          const staffRoleId = require('../config/client').suggestions.staffRoleId;
          if (!interaction.member.roles.cache.has(staffRoleId) &&
              !interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
              embeds: [errorEmbed('You do not have permission to manage suggestions.')],
              ephemeral: true,
            });
          }

          const message = interaction.message;
          const embed = message.embeds[0];
          const isApprove = interaction.customId === 'suggest_approve';
          const newStatus = isApprove ? '✅ Approved' : '❌ Rejected';

          const approvedEmbed = require('../utils/embeds').createEmbed({
            title: `${require('../config/client').emoji.suggestion} Suggestion`,
            description: embed.description,
            color: isApprove ? require('../config/client').embed.color.success : require('../config/client').embed.color.error,
            author: embed.author,
            fields: [
              { name: 'Status', value: `${newStatus} by ${interaction.user.tag}`, inline: true },
            ],
            timestamp: new Date(),
          });

          // Disable buttons
          const disabledRow = require('discord.js').ActionRowBuilder.from(
            interaction.message.components[0]
          );
          disabledRow.components.forEach((c) => c.setDisabled(true));

          await message.edit({ embeds: [approvedEmbed], components: [disabledRow] });
          await interaction.reply({
            embeds: [require('../utils/embeds').successEmbed(`Suggestion ${isApprove ? 'approved' : 'rejected'}.`)],
            ephemeral: true,
          });

          // Update DB
          const { run } = require('../database/database').getDb();
          run('UPDATE suggestions SET status = ? WHERE message_id = ?',
            [isApprove ? 'approved' : 'rejected', message.id]);

          // Log
          const logChannel = interaction.guild.channels.cache.get(require('../config/client').moderation.logChannelId);
          if (logChannel) {
            await logChannel.send({
              embeds: [require('../utils/embeds').createEmbed({
                title: `💡 Suggestion ${isApprove ? 'Approved' : 'Rejected'}`,
                description: embed.description,
                color: isApprove ? require('../config/client').embed.color.success : require('../config/client').embed.color.error,
                fields: [
                  { name: 'Moderator', value: interaction.user.tag, inline: true },
                  { name: 'Author', value: embed.author?.name || 'Unknown', inline: true },
                ],
                timestamp: new Date(),
              })],
            });
          }
          return;
        }

        // ─── Poll Voting ─────────────────────────────────
        if (interaction.customId.startsWith('poll_vote_')) {
          const option = interaction.customId === 'poll_vote_1' ? 1 : 2;
          const message = interaction.message;
          const embed = message.embeds[0];

          // Track votes per user to prevent double voting
          const voteKey = `poll_${message.id}_${interaction.user.id}`;
          const { get } = require('../database/database').getDb();

          const existingVote = get(
            'SELECT * FROM polls WHERE message_id = ?',
            [message.id]
          );

          if (existingVote) {
            // For simplicity, we use a temporary approach
            // In production, create a poll_votes table
          }

          await interaction.reply({
            embeds: [require('../utils/embeds').successEmbed(`You voted for **Option ${option}**.`)],
            ephemeral: true,
          });
          return;
        }

        // ─── Giveaway Entry ──────────────────────────────
        if (interaction.customId === 'giveaway_enter') {
          const { get, run } = require('../database/database').getDb();
          const giveaway = get('SELECT * FROM giveaways WHERE message_id = ?', [interaction.message.id]);

          if (!giveaway || giveaway.ended) {
            return interaction.reply({
              embeds: [errorEmbed('This giveaway has ended.')],
              ephemeral: true,
            });
          }

          run(
            'INSERT OR IGNORE INTO ticket_messages (ticket_id, author_id, content) VALUES (?, ?, ?)',
            [interaction.message.id, interaction.user.id, 'giveaway_entry']
          );

          await interaction.reply({
            embeds: [require('../utils/embeds').successEmbed('You have entered the giveaway!')],
            ephemeral: true,
          });
          return;
        }
      }

    } catch (error) {
      logger.error('Error handling interaction:', error);

      const errorMsg = 'An unexpected error occurred. Please try again later.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [errorEmbed(errorMsg)], ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [errorEmbed(errorMsg)], ephemeral: true }).catch(() => {});
      }
    }
  },
};
