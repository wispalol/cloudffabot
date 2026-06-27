const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const config = require('../config/client');
const { getDb } = require('../database/database');
const logger = require('../config/logger');
const { createEmbed, successEmbed, errorEmbed } = require('../utils/embeds');
const { getTicketTypeName, getTicketTypeEmoji, sanitizeChannelName } = require('../utils/helpers');
const { generateTranscript } = require('../utils/transcript');
const { startAutoResponse } = require('./autoResponder');
const path = require('path');
const fs = require('fs');

/**
 * Ticket types and their display labels / emojis.
 */
const TICKET_TYPES = [
  { value: 'ban_appeal', label: 'Ban Appeal', emoji: '🔨' },
  { value: 'bug_report', label: 'Bug Report', emoji: '🐛' },
  { value: 'player_report', label: 'Player Report', emoji: '👤' },
  { value: 'general_support', label: 'General Support', emoji: '❓' },
  { value: 'purchase_support', label: 'Purchase Support', emoji: '💳' },
];

/**
 * Sends the ticket panel to the specified channel.
 * The panel contains a dropdown for selecting the ticket type.
 */
async function sendTicketPanel(channel) {
  const embed = createEmbed({
    title: `${config.emoji.ticket} Ticket System`,
    description:
      'Select a ticket type from the dropdown below to get started.\n' +
      'Please do not create duplicate tickets — staff will respond as soon as possible.',
    color: config.embed.color.primary,
    fields: TICKET_TYPES.map((t) => ({
      name: `${t.emoji} ${t.label}`,
      value: `Open a **${t.label}** ticket`,
      inline: true,
    })),
    footerText: 'Select an option below',
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_create')
    .setPlaceholder('Choose a ticket type...')
    .addOptions(
      TICKET_TYPES.map((t) => ({
        label: t.label,
        value: t.value,
        emoji: t.emoji,
      }))
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await channel.send({ embeds: [embed], components: [row] });
}

/**
 * Handles a user selecting a ticket type from the dropdown.
 * Checks for existing open tickets of the same type, then creates the channel.
 */
async function handleTicketCreate(interaction) {
  const type = interaction.values[0];
  const guild = interaction.guild;
  const member = interaction.member;
  const categoryId = config.ticket.categoryId;

  // Check for duplicate open ticket of the same type
  const { get, run } = getDb();
  const existing = get(
    `SELECT channel_id FROM tickets WHERE creator_id = ? AND guild_id = ? AND type = ? AND status = 'open'`,
    [member.id, guild.id, type]
  );

  if (existing) {
    const existingChannel = guild.channels.cache.get(existing.channel_id);
    if (existingChannel) {
      return interaction.reply({
        embeds: [
          errorEmbed(
            `You already have an open **${getTicketTypeName(type)}** ticket: ${existingChannel}. Please wait for staff to respond.`
          ),
        ],
        ephemeral: true,
      });
    }
    // Channel no longer exists — mark as closed in DB
    run(`UPDATE tickets SET status = 'closed' WHERE channel_id = ?`, [existing.channel_id]);
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const ticketId = `ticket-${Date.now()}`;
    const channelName = `${type.replace(/_/g, '-')}-${sanitizeChannelName(interaction.user.username)}`;

    const category = categoryId ? guild.channels.cache.get(categoryId) : null;

    const overwrites = [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
    ];

    if (config.ticket.staffRoleId) {
      overwrites.push({
        id: config.ticket.staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      });
    }

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category || undefined,
      permissionOverwrites: overwrites,
    });

    // Store in database
    run(
      `INSERT INTO tickets (ticket_id, channel_id, guild_id, creator_id, type, status) VALUES (?, ?, ?, ?, ?, 'open')`,
      [ticketId, ticketChannel.id, guild.id, member.id, type]
    );

    // Send initial embed with questions
    const typeName = getTicketTypeName(type);
    const typeEmoji = getTicketTypeEmoji(type);
    const questions = config.ticket.questions[type] || ['Please describe your issue.'];

    const questionsStr = questions
      .map((q, i) => `**${i + 1}.** ${q}`)
      .join('\n');

    const initialEmbed = createEmbed({
      title: `${typeEmoji} ${typeName} Ticket`,
      description: `Welcome, ${member}! Please provide the following information so staff can assist you:\n\n${questionsStr}`,
      color: config.embed.color.primary,
      fields: [
        {
          name: 'Ticket ID',
          value: `\`${ticketId}\``,
          inline: true,
        },
        {
          name: 'Status',
          value: '🔴 Open',
          inline: true,
        },
      ],
      timestamp: new Date(),
    });

    // Action buttons for the ticket
    const buttons = [
      new ButtonBuilder()
        .setCustomId(`ticket_close_${ticketId}`)
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId(`ticket_claim_${ticketId}`)
        .setLabel('Claim Ticket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🙋'),
      new ButtonBuilder()
        .setCustomId(`ticket_add_${ticketId}`)
        .setLabel('Add User')
        .setStyle(ButtonStyle.Success)
        .setEmoji('➕'),
      new ButtonBuilder()
        .setCustomId(`ticket_remove_${ticketId}`)
        .setLabel('Remove User')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('➖'),
      new ButtonBuilder()
        .setCustomId(`ticket_rename_${ticketId}`)
        .setLabel('Rename')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✏️'),
    ];

    const row1 = new ActionRowBuilder().addComponents(buttons);

    const buttons2 = [
      new ButtonBuilder()
        .setCustomId(`ticket_transcript_${ticketId}`)
        .setLabel('Transcript')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📄'),
      new ButtonBuilder()
        .setCustomId(`ticket_reopen_${ticketId}`)
        .setLabel('Reopen')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔓'),
      new ButtonBuilder()
        .setCustomId(`ticket_delete_${ticketId}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),
    ];

    const row2 = new ActionRowBuilder().addComponents(buttons2);

    const pingContent = config.ticket.staffRoleId
      ? `<@&${config.ticket.staffRoleId}> — New ${typeName} ticket from ${member}`
      : `New ${typeName} ticket from ${member}`;

    await ticketChannel.send({
      content: pingContent,
      embeds: [initialEmbed],
      components: [row1, row2],
    });

    // Log ticket creation
    await logTicketAction(guild, 'Ticket Created', {
      ticketId,
      type: typeName,
      creator: member.user,
      channel: ticketChannel,
    });

    await interaction.editReply({
      embeds: [successEmbed(`Your **${typeName}** ticket has been created: ${ticketChannel}`)],
    });

    // Start automated help flow
    startAutoResponse(ticketChannel, member, type, ticketId).catch((err) =>
      logger.error('Auto-responder error:', err)
    );

    // Set up inactivity timer for auto-close
    scheduleInactivityCheck(ticketChannel, ticketId);
  } catch (error) {
    logger.error('Failed to create ticket:', error);
    await interaction.editReply({
      embeds: [errorEmbed('Failed to create ticket. Please try again later.')],
    });
  }
}

/**
 * Handles ticket button interactions (close, claim, add, remove, rename, etc.)
 */
async function handleTicketButton(interaction) {
  const customId = interaction.customId;
  const [action, ticketId] = customId.split('_').slice(1).join('_').split('_');
  // Actually: customId format is ticket_action_ticketId
  // Let's parse properly:
  const parts = customId.split('_');
  const actionName = parts[1];
  const ticketIdValue = parts.slice(2).join('_');

  const channel = interaction.channel;
  const member = interaction.member;
  const { get } = getDb();

  const ticket = get(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketIdValue]);

  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed('Ticket not found in database.')], ephemeral: true });
  }

  switch (actionName) {
    case 'close':
      return handleCloseTicket(interaction, ticket);
    case 'claim':
      return handleClaimTicket(interaction, ticket);
    case 'add':
      return handleAddUser(interaction, ticket);
    case 'remove':
      return handleRemoveUser(interaction, ticket);
    case 'rename':
      return handleRenameTicket(interaction, ticket);
    case 'transcript':
      return handleTranscript(interaction, ticket);
    case 'reopen':
      return handleReopenTicket(interaction, ticket);
    case 'delete':
      return handleDeleteTicket(interaction, ticket);
    case 'escalate':
      return handleEscalateTicket(interaction, ticket);
    case 'resolved':
      return handleResolvedTicket(interaction, ticket);
    default:
      return interaction.reply({ embeds: [errorEmbed('Unknown action.')], ephemeral: true });
  }
}

/**
 * Close a ticket with confirmation.
 */
async function handleCloseTicket(interaction, ticket) {
  if (ticket.status === 'closed') {
    return interaction.reply({ embeds: [errorEmbed('This ticket is already closed.')], ephemeral: true });
  }

  const confirmEmbed = createEmbed({
    title: '🔒 Confirm Close',
    description: 'Are you sure you want to close this ticket? A transcript will be generated.',
    color: config.embed.color.warning,
  });

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_confirm_close_${ticket.ticket_id}`)
      .setLabel('Yes, Close')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket_cancel_${ticket.ticket_id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: false });
}

/**
 * Actually performs the close after confirmation.
 */
async function confirmCloseTicket(interaction, ticket) {
  const channel = interaction.channel;
  const { run } = getDb();

  await interaction.update({ components: [] });

  const processingEmbed = createEmbed({
    title: '🔒 Closing Ticket',
    description: 'Generating transcript and closing...',
    color: config.embed.color.warning,
  });

  await channel.send({ embeds: [processingEmbed] });

  try {
    const html = await generateTranscript(channel, ticket.ticket_id);

    // Save transcript to file
    const transcriptDir = path.join(__dirname, '../../transcripts');
    if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir, { recursive: true });
    const filePath = path.join(transcriptDir, `${ticket.ticket_id}.html`);
    fs.writeFileSync(filePath, html);

    // Send transcript to log channel
    const logChannel = interaction.guild.channels.cache.get(config.ticket.logChannelId);
    if (logChannel) {
      const logEmbed = createEmbed({
        title: '📄 Ticket Closed',
        description: `**Ticket:** ${ticket.ticket_id}\n**Type:** ${getTicketTypeName(ticket.type)}\n**Creator:** <@${ticket.creator_id}>\n**Closed by:** ${interaction.user.tag}`,
        color: config.embed.color.error,
        timestamp: new Date(),
      });
      await logChannel.send({
        embeds: [logEmbed],
        files: [filePath],
      });
    }

    // DM the transcript to the ticket creator
    try {
      const creator = await interaction.client.users.fetch(ticket.creator_id);
      const dmEmbed = createEmbed({
        title: '📄 Ticket Transcript',
        description: `Your **${getTicketTypeName(ticket.type)}** ticket has been closed. A transcript is attached.`,
        color: config.embed.color.primary,
      });
      await creator.send({ embeds: [dmEmbed], files: [filePath] });
    } catch {
      logger.warn(`Could not DM transcript to ${ticket.creator_id}`);
    }

    // Update database
    run(
      `UPDATE tickets SET status = 'closed', closed_at = datetime('now'), transcript_url = ? WHERE ticket_id = ?`,
      [filePath, ticket.ticket_id]
    );

    // Log the action
    await logTicketAction(interaction.guild, 'Ticket Closed', {
      ticketId: ticket.ticket_id,
      type: getTicketTypeName(ticket.type),
      creator: ticket.creator_id,
      closedBy: interaction.user,
    });

    // Change channel name prefix to closed-
    await channel.setName(`closed-${channel.name}`);

    // Remove send permissions for everyone except staff
    await channel.permissionOverwrites.edit(ticket.creator_id, {
      SendMessages: false,
    });

    // Send closure message
    await channel.send({
      embeds: [
        createEmbed({
          title: '✅ Ticket Closed',
          description: `This ticket has been closed by ${interaction.user}.`,
          color: config.embed.color.success,
        }),
      ],
    });
  } catch (error) {
    logger.error('Error closing ticket:', error);
    await channel.send({
      embeds: [errorEmbed('An error occurred while closing the ticket.')],
    });
  }
}

/**
 * Claim a ticket — assigns it to a staff member.
 */
async function handleClaimTicket(interaction, ticket) {
  if (ticket.claimed_by) {
    return interaction.reply({
      embeds: [errorEmbed(`This ticket is already claimed by <@${ticket.claimed_by}>.`)],
      ephemeral: true,
    });
  }

  const { run } = getDb();
  run(`UPDATE tickets SET claimed_by = ? WHERE ticket_id = ?`, [
    interaction.user.id,
    ticket.ticket_id,
  ]);

  await interaction.reply({
    embeds: [
      createEmbed({
        title: '🙋 Ticket Claimed',
        description: `This ticket has been claimed by ${interaction.user}.`,
        color: config.embed.color.success,
      }),
    ],
  });

  await logTicketAction(interaction.guild, 'Ticket Claimed', {
    ticketId: ticket.ticket_id,
    claimedBy: interaction.user,
  });
}

/**
 * Add a user to the ticket channel.
 */
async function handleAddUser(interaction, ticket) {
  // Ask for the user to add via a modal or ephemeral prompt
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

  const modal = new ModalBuilder()
    .setCustomId(`ticket_adduser_modal_${ticket.ticket_id}`)
    .setTitle('Add User to Ticket');

  const userIdInput = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel('User ID or Mention')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter the user ID or @mention')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));

  await interaction.showModal(modal);
}

/**
 * Remove a user from the ticket channel.
 */
async function handleRemoveUser(interaction, ticket) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

  const modal = new ModalBuilder()
    .setCustomId(`ticket_removeuser_modal_${ticket.ticket_id}`)
    .setTitle('Remove User from Ticket');

  const userIdInput = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel('User ID or Mention')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter the user ID or @mention')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));

  await interaction.showModal(modal);
}

/**
 * Rename the ticket channel.
 */
async function handleRenameTicket(interaction, ticket) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

  const modal = new ModalBuilder()
    .setCustomId(`ticket_rename_modal_${ticket.ticket_id}`)
    .setTitle('Rename Ticket');

  const nameInput = new TextInputBuilder()
    .setCustomId('new_name')
    .setLabel('New Channel Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter a new name (no spaces)')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

  await interaction.showModal(modal);
}

/**
 * Generate and send a transcript on demand.
 */
async function handleTranscript(interaction, ticket) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const html = await generateTranscript(interaction.channel, ticket.ticket_id);
    const transcriptDir = path.join(__dirname, '../../transcripts');
    if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir, { recursive: true });
    const filePath = path.join(transcriptDir, `${ticket.ticket_id}-${Date.now()}.html`);
    fs.writeFileSync(filePath, html);

    await interaction.editReply({
      embeds: [successEmbed('Transcript generated.')],
      files: [filePath],
    });
  } catch (error) {
    logger.error('Error generating transcript:', error);
    await interaction.editReply({
      embeds: [errorEmbed('Failed to generate transcript.')],
    });
  }
}

/**
 * Reopen a closed ticket.
 */
async function handleReopenTicket(interaction, ticket) {
  if (ticket.status !== 'closed') {
    return interaction.reply({ embeds: [errorEmbed('This ticket is already open.')], ephemeral: true });
  }

  const { run } = getDb();
  run(`UPDATE tickets SET status = 'open', closed_at = NULL WHERE ticket_id = ?`, [ticket.ticket_id]);

  await interaction.channel.setName(interaction.channel.name.replace(/^closed-/, ''));

  await interaction.reply({
    embeds: [
      createEmbed({
        title: '🔓 Ticket Reopened',
        description: `This ticket has been reopened by ${interaction.user}.`,
        color: config.embed.color.success,
      }),
    ],
  });

  await interaction.channel.permissionOverwrites.edit(ticket.creator_id, {
    SendMessages: true,
  });
}

/**
 * Delete a ticket channel entirely.
 */
async function handleDeleteTicket(interaction, ticket) {
  const confirmEmbed = createEmbed({
    title: '🗑️ Confirm Deletion',
    description: 'Are you sure you want to **permanently delete** this ticket channel? This action cannot be undone.',
    color: config.embed.color.error,
  });

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_confirm_delete_${ticket.ticket_id}`)
      .setLabel('Yes, Delete')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket_cancel_${ticket.ticket_id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: false });
}

/**
 * Confirm delete — removes the channel and updates DB.
 */
async function confirmDeleteTicket(interaction, ticket) {
  const { run } = getDb();
  run(`UPDATE tickets SET status = 'deleted' WHERE ticket_id = ?`, [ticket.ticket_id]);

  await interaction.reply({
    embeds: [successEmbed('Deleting ticket channel...')],
  });

  await logTicketAction(interaction.guild, 'Ticket Deleted', {
    ticketId: ticket.ticket_id,
    deletedBy: interaction.user,
  });

  await interaction.channel.delete();
}

/**
 * Handles modals submitted for ticket actions (add user, remove user, rename).
 */
async function handleTicketModal(interaction) {
  const modalId = interaction.customId;

  if (modalId.startsWith('ticket_adduser_modal_')) {
    const ticketId = modalId.replace('ticket_adduser_modal_', '');
    const userId = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
    const member = await interaction.guild.members.fetch(userId).catch(() => null);

    if (!member) {
      return interaction.reply({ embeds: [errorEmbed('User not found.')], ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });

    await interaction.reply({
      embeds: [successEmbed(`Added ${member} to this ticket.`)],
    });
  }

  if (modalId.startsWith('ticket_removeuser_modal_')) {
    const ticketId = modalId.replace('ticket_removeuser_modal_', '');
    const userId = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
    const member = await interaction.guild.members.fetch(userId).catch(() => null);

    if (!member) {
      return interaction.reply({ embeds: [errorEmbed('User not found.')], ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: false,
    });

    await interaction.reply({
      embeds: [successEmbed(`Removed ${member} from this ticket.`)],
    });
  }

  if (modalId.startsWith('ticket_rename_modal_')) {
    const ticketId = modalId.replace('ticket_rename_modal_', '');
    const newName = interaction.fields.getTextInputValue('new_name').toLowerCase().replace(/[^a-z0-9_-]/g, '');

    if (!newName) {
      return interaction.reply({ embeds: [errorEmbed('Invalid channel name.')], ephemeral: true });
    }

    await interaction.channel.setName(newName);
    await interaction.reply({
      embeds: [successEmbed(`Channel renamed to \`${newName}\`.`)],
    });
  }
}

/**
 * Logs a ticket action to the ticket log channel.
 */
async function logTicketAction(guild, action, data) {
  const logChannel = guild.channels.cache.get(config.ticket.logChannelId);
  if (!logChannel) return;

  const embed = createEmbed({
    title: `${config.emoji.ticket} ${action}`,
    color: action.includes('Close') ? config.embed.color.error : config.embed.color.success,
    fields: [
      { name: 'Ticket ID', value: `\`${data.ticketId}\``, inline: true },
      ...(data.type ? [{ name: 'Type', value: data.type, inline: true }] : []),
      ...(data.creator
        ? [{ name: 'Creator', value: `${data.creator} (\`${data.creator.id}\`)`, inline: true }]
        : []),
      ...(data.claimedBy
        ? [{ name: 'Claimed By', value: `${data.claimedBy} (\`${data.claimedBy.id}\`)`, inline: true }]
        : []),
      ...(data.closedBy
        ? [{ name: 'Closed By', value: `${data.closedBy} (\`${data.closedBy.id}\`)`, inline: true }]
        : []),
      ...(data.deletedBy
        ? [{ name: 'Deleted By', value: `${data.deletedBy} (\`${data.deletedBy.id}\`)`, inline: true }]
        : []),
      ...(data.channel
        ? [{ name: 'Channel', value: `${data.channel} (\`${data.channel.id}\`)`, inline: false }]
        : []),
    ],
    timestamp: new Date(),
  });

  await logChannel.send({ embeds: [embed] });
}

/**
 * Schedules an inactivity check for a ticket channel.
 * After 24 hours of no messages, a warning is sent.
 * After 48 hours, the ticket is auto-closed.
 */
function scheduleInactivityCheck(channel, ticketId) {
  // This is a simplified version — in production you'd use a proper scheduler
  // or check on each message event.
  const INACTIVITY_WARNING = 24 * 60 * 60 * 1000; // 24 hours
  const INACTIVITY_CLOSE = 48 * 60 * 60 * 1000; // 48 hours

  setTimeout(async () => {
    try {
      const { get: g, run: r } = getDb();
      const ticket = g(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketId]);
      if (!ticket || ticket.status !== 'open') return;

      // Check last message in channel
      const lastMessage = (await channel.messages.fetch({ limit: 1 })).first();
      if (!lastMessage) return;

      const timeSinceLastMessage = Date.now() - lastMessage.createdTimestamp;

      if (timeSinceLastMessage > INACTIVITY_CLOSE) {
        // Auto-close the ticket
        await channel.send({
          embeds: [
            createEmbed({
              title: '🔒 Auto-Closed',
              description: 'This ticket has been automatically closed due to inactivity.',
              color: config.embed.color.warning,
            }),
          ],
        });
        r(`UPDATE tickets SET status = 'closed' WHERE ticket_id = ?`, [ticketId]);
      } else if (timeSinceLastMessage > INACTIVITY_WARNING) {
        await channel.send({
          embeds: [
            createEmbed({
              title: '⚠️ Inactivity Warning',
              description: 'This ticket will be automatically closed in 24 hours if there is no response.',
              color: config.embed.color.warning,
            }),
          ],
        });
      }
    } catch (error) {
      logger.error('Inactivity check error:', error);
    }
  }, Math.max(INACTIVITY_WARNING, 60 * 1000)); // Check at least after 1 minute
}

async function handleEscalateTicket(interaction, ticket) {
  await interaction.reply({
    embeds: [
      createEmbed({
        title: '🙋 Staff Requested',
        description: 'A staff member has been notified. Please wait for assistance.',
        color: config.embed.color.warning,
      }),
    ],
  });

  const staffRoleId = config.ticket.staffRoleId;
  if (staffRoleId) {
    await interaction.channel.send({
      content: `<@&${staffRoleId}> — ${interaction.user} is requesting staff assistance in this ticket.`,
      embeds: [
        createEmbed({
          title: '🙋 Staff Assistance Requested',
          description: `${interaction.user} has requested a human staff member to help with their ticket.`,
          color: config.embed.color.warning,
        }),
      ],
    });
  }
}

async function handleResolvedTicket(interaction, ticket) {
  await interaction.reply({
    embeds: [
      createEmbed({
        title: '✅ Glad We Could Help!',
        description: "I'm glad your issue was resolved! If you need anything else, just ask here or close the ticket using the button above.",
        color: config.embed.color.success,
      }),
    ],
  });
}

module.exports = {
  TICKET_TYPES,
  sendTicketPanel,
  handleTicketCreate,
  handleTicketButton,
  confirmCloseTicket,
  confirmDeleteTicket,
  handleTicketModal,
};
