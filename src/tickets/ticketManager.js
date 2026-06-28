const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
const i18n = require('../i18n');
const path = require('path');
const fs = require('fs');

const TICKET_TYPES = [
  { value: 'ban_appeal', label: 'Ban Appeal', emoji: '🔨' },
  { value: 'bug_report', label: 'Bug Report', emoji: '🐛' },
  { value: 'player_report', label: 'Player Report', emoji: '👤' },
  { value: 'general_support', label: 'General Support', emoji: '❓' },
  { value: 'purchase_support', label: 'Purchase Support', emoji: '💳' },
];

async function sendTicketPanel(channel) {
  const embed = createEmbed({
    title: i18n.t('ticket.panel.title'),
    description: i18n.t('ticket.panel.description'),
    color: config.embed.color.primary,
    fields: TICKET_TYPES.map((t) => ({
      name: `${t.emoji} ${t.label}`,
      value: `Open a **${t.label}** ticket`,
      inline: true,
    })),
    footerText: i18n.t('ticket.panel.footer'),
  });

  const buttons = TICKET_TYPES.map((t) =>
    new ButtonBuilder()
      .setCustomId(`ticket_create_${t.value}`)
      .setLabel(t.label)
      .setEmoji(t.emoji)
      .setStyle(ButtonStyle.Primary)
  );

  const row = new ActionRowBuilder().addComponents(buttons);

  await channel.send({ embeds: [embed], components: [row] });
}

async function handleTicketCreate(interaction) {
  const type = interaction.customId.replace('ticket_create_', '');
  const guild = interaction.guild;
  const member = interaction.member;
  const categoryId = config.ticket.categoryId;
  const creatorId = member.id;

  const { get, run } = getDb();
  const existing = get(
    `SELECT channel_id FROM tickets WHERE creator_id = ? AND guild_id = ? AND type = ? AND status = 'open'`,
    [creatorId, guild.id, type]
  );

  if (existing) {
    const existingChannel = guild.channels.cache.get(existing.channel_id);
    if (existingChannel) {
      return interaction.reply({
        embeds: [
          errorEmbed(
            i18n.t('ticket.error.duplicate', creatorId, {
              type: getTicketTypeName(type),
              channel: existingChannel,
            })
          ),
        ],
        ephemeral: true,
      });
    }
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

    if (config.ticket.adminRoleId) {
      overwrites.push({
        id: config.ticket.adminRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      });
    }

    if (config.ticket.managerRoleId) {
      overwrites.push({
        id: config.ticket.managerRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      });
    }

    if (guild.ownerId) {
      overwrites.push({
        id: guild.ownerId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category || undefined,
      permissionOverwrites: overwrites,
    });

    run(
      `INSERT INTO tickets (ticket_id, channel_id, guild_id, creator_id, type, status) VALUES (?, ?, ?, ?, ?, 'open')`,
      [ticketId, ticketChannel.id, guild.id, member.id, type]
    );

    const typeName = getTicketTypeName(type);
    const typeEmoji = getTicketTypeEmoji(type);

    const initialEmbed = createEmbed({
      title: i18n.t('ticket.create.initial_title', creatorId, { emoji: typeEmoji, type: typeName }),
      description: i18n.t('ticket.create.initial_desc', creatorId, { member }),
      color: config.embed.color.primary,
      fields: [
        {
          name: i18n.t('ticket.create.field_ticket_id', creatorId),
          value: `\`${ticketId}\``,
          inline: true,
        },
        {
          name: i18n.t('ticket.create.field_status', creatorId),
          value: i18n.t('ticket.create.status_open', creatorId),
          inline: true,
        },
      ],
      timestamp: new Date(),
    });

    const buttons = [
      new ButtonBuilder()
        .setCustomId(`ticket_close_${ticketId}`)
        .setLabel(i18n.t('ticket_button.close', creatorId))
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId(`ticket_claim_${ticketId}`)
        .setLabel(i18n.t('ticket_button.claim', creatorId))
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🙋'),
      new ButtonBuilder()
        .setCustomId(`ticket_add_${ticketId}`)
        .setLabel(i18n.t('ticket_button.add', creatorId))
        .setStyle(ButtonStyle.Success)
        .setEmoji('➕'),
      new ButtonBuilder()
        .setCustomId(`ticket_remove_${ticketId}`)
        .setLabel(i18n.t('ticket_button.remove', creatorId))
        .setStyle(ButtonStyle.Danger)
        .setEmoji('➖'),
      new ButtonBuilder()
        .setCustomId(`ticket_rename_${ticketId}`)
        .setLabel(i18n.t('ticket_button.rename', creatorId))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✏️'),
    ];

    const row1 = new ActionRowBuilder().addComponents(buttons);

    const buttons2 = [
      new ButtonBuilder()
        .setCustomId(`ticket_transcript_${ticketId}`)
        .setLabel(i18n.t('ticket_button.transcript', creatorId))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📄'),
      new ButtonBuilder()
        .setCustomId(`ticket_reopen_${ticketId}`)
        .setLabel(i18n.t('ticket_button.reopen', creatorId))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔓'),
      new ButtonBuilder()
        .setCustomId(`ticket_delete_${ticketId}`)
        .setLabel(i18n.t('ticket_button.delete', creatorId))
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),
    ];

    const row2 = new ActionRowBuilder().addComponents(buttons2);

    const pingContent = config.ticket.staffRoleId
      ? i18n.t('ticket.create.ping', null, { roleId: config.ticket.staffRoleId, type: typeName, member })
      : i18n.t('ticket.create.ping_no_role', null, { type: typeName, member });

    await ticketChannel.send({
      content: pingContent,
      embeds: [initialEmbed],
      components: [row1, row2],
    });

    await logTicketAction(guild, i18n.t('ticket.log.created'), {
      ticketId,
      type: typeName,
      creator: member.user,
      channel: ticketChannel,
    });

    await interaction.editReply({
      embeds: [successEmbed(i18n.t('ticket.create.success', creatorId, { type: typeName, channel: ticketChannel }))],
    });

    startAutoResponse(ticketChannel, member, type, ticketId, creatorId).catch((err) =>
      logger.error('Auto-responder error:', err)
    );

    scheduleInactivityCheck(ticketChannel, ticketId);
  } catch (error) {
    logger.error('Failed to create ticket:', error);
    await interaction.editReply({
      embeds: [errorEmbed(i18n.t('ticket.error.create_failed', creatorId))],
    });
  }
}

async function handleTicketButton(interaction) {
  const customId = interaction.customId;
  const parts = customId.split('_');
  const actionName = parts[1];
  const ticketIdValue = parts.slice(2).join('_');
  const member = interaction.member;
  const { get } = getDb();

  const ticket = get(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketIdValue]);

  if (!ticket) {
    return interaction.reply({
      embeds: [errorEmbed(i18n.t('ticket.error.not_found', member.id))],
      ephemeral: true,
    });
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
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('ticket.error.unknown_action', member.id))],
        ephemeral: true,
      });
  }
}

async function handleCloseTicket(interaction, ticket) {
  if (ticket.status === 'closed') {
    return interaction.reply({
      embeds: [errorEmbed(i18n.t('ticket.error.already_closed', interaction.member.id))],
      ephemeral: true,
    });
  }

  const confirmEmbed = createEmbed({
    title: i18n.t('ticket.close.confirm_title', interaction.member.id),
    description: i18n.t('ticket.close.confirm_desc', interaction.member.id),
    color: config.embed.color.warning,
  });

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_confirm_close_${ticket.ticket_id}`)
      .setLabel(i18n.t('ticket.close.yes', interaction.member.id))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket_cancel_${ticket.ticket_id}`)
      .setLabel(i18n.t('ticket.close.cancel', interaction.member.id))
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: false });
}

async function confirmCloseTicket(interaction, ticket) {
  const channel = interaction.channel;
  const { run } = getDb();
  const userId = ticket.creator_id;

  await interaction.update({ components: [] });

  const processingEmbed = createEmbed({
    title: i18n.t('ticket.close.processing', userId),
    color: config.embed.color.warning,
  });

  await channel.send({ embeds: [processingEmbed] });

  try {
    const html = await generateTranscript(channel, ticket.ticket_id);

    const transcriptDir = path.join(__dirname, '../../transcripts');
    if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir, { recursive: true });
    const filePath = path.join(transcriptDir, `${ticket.ticket_id}.html`);
    fs.writeFileSync(filePath, html);

    const logChannel = interaction.guild.channels.cache.get(config.ticket.logChannelId);
    if (logChannel) {
      const logEmbed = createEmbed({
        title: i18n.t('ticket.close.log_title'),
        description: i18n.t('ticket.close.log_desc', null, {
          ticketId: ticket.ticket_id,
          type: getTicketTypeName(ticket.type),
          creator: `<@${ticket.creator_id}>`,
          closer: interaction.user.tag,
        }),
        color: config.embed.color.error,
        timestamp: new Date(),
      });
      await logChannel.send({
        embeds: [logEmbed],
        files: [filePath],
      });
    }

    try {
      const creator = await interaction.client.users.fetch(ticket.creator_id);
      const dmEmbed = createEmbed({
        title: i18n.t('ticket.close.dm_title', ticket.creator_id),
        description: i18n.t('ticket.close.dm_desc', ticket.creator_id, { type: getTicketTypeName(ticket.type) }),
        color: config.embed.color.primary,
      });
      await creator.send({ embeds: [dmEmbed], files: [filePath] });
    } catch {
      logger.warn(`Could not DM transcript to ${ticket.creator_id}`);
    }

    run(
      `UPDATE tickets SET status = 'closed', closed_at = datetime('now'), transcript_url = ? WHERE ticket_id = ?`,
      [filePath, ticket.ticket_id]
    );

    await logTicketAction(interaction.guild, i18n.t('ticket.log.closed'), {
      ticketId: ticket.ticket_id,
      type: getTicketTypeName(ticket.type),
      creator: ticket.creator_id,
      closedBy: interaction.user,
    });

    await channel.setName(`closed-${channel.name}`);

    await channel.permissionOverwrites.edit(ticket.creator_id, {
      SendMessages: false,
    });

    await channel.send({
      embeds: [
        createEmbed({
          title: i18n.t('ticket.close.success_title', ticket.creator_id),
          description: i18n.t('ticket.close.success_desc', ticket.creator_id, { user: interaction.user }),
          color: config.embed.color.success,
        }),
      ],
    });
  } catch (error) {
    logger.error('Error closing ticket:', error);
    await channel.send({
      embeds: [errorEmbed(i18n.t('ticket.error.close_failed', ticket.creator_id))],
    });
  }
}

async function handleClaimTicket(interaction, ticket) {
  const member = interaction.member;
  const staffRoleId = config.ticket.staffRoleId;

  if (staffRoleId && !member.roles.cache.has(staffRoleId)) {
    return interaction.reply({
      embeds: [errorEmbed(i18n.t('ticket.error.claim_staff_only', member.id))],
      ephemeral: true,
    });
  }

  if (ticket.claimed_by) {
    return interaction.reply({
      embeds: [errorEmbed(i18n.t('ticket.error.already_claimed', member.id, { user: `<@${ticket.claimed_by}>` }))],
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
        title: i18n.t('ticket.claim.success_title', member.id),
        description: i18n.t('ticket.claim.success_desc', member.id, { user: interaction.user }),
        color: config.embed.color.success,
      }),
    ],
  });

  await logTicketAction(interaction.guild, i18n.t('ticket.log.claimed'), {
    ticketId: ticket.ticket_id,
    claimedBy: interaction.user,
  });
}

async function handleAddUser(interaction, ticket) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

  const modal = new ModalBuilder()
    .setCustomId(`ticket_adduser_modal_${ticket.ticket_id}`)
    .setTitle(i18n.t('ticket.add.title', interaction.member.id));

  const userIdInput = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel(i18n.t('ticket.add.label', interaction.member.id))
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(i18n.t('ticket.add.placeholder', interaction.member.id))
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));

  await interaction.showModal(modal);
}

async function handleRemoveUser(interaction, ticket) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

  const modal = new ModalBuilder()
    .setCustomId(`ticket_removeuser_modal_${ticket.ticket_id}`)
    .setTitle(i18n.t('ticket.remove.title', interaction.member.id));

  const userIdInput = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel(i18n.t('ticket.remove.label', interaction.member.id))
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(i18n.t('ticket.remove.placeholder', interaction.member.id))
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));

  await interaction.showModal(modal);
}

async function handleRenameTicket(interaction, ticket) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

  const modal = new ModalBuilder()
    .setCustomId(`ticket_rename_modal_${ticket.ticket_id}`)
    .setTitle(i18n.t('ticket.rename.title', interaction.member.id));

  const nameInput = new TextInputBuilder()
    .setCustomId('new_name')
    .setLabel(i18n.t('ticket.rename.label', interaction.member.id))
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(i18n.t('ticket.rename.placeholder', interaction.member.id))
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

  await interaction.showModal(modal);
}

async function handleTranscript(interaction, ticket) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const html = await generateTranscript(interaction.channel, ticket.ticket_id);
    const transcriptDir = path.join(__dirname, '../../transcripts');
    if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir, { recursive: true });
    const filePath = path.join(transcriptDir, `${ticket.ticket_id}-${Date.now()}.html`);
    fs.writeFileSync(filePath, html);

    await interaction.editReply({
      embeds: [successEmbed(i18n.t('ticket.transcript.success', interaction.member.id))],
      files: [filePath],
    });
  } catch (error) {
    logger.error('Error generating transcript:', error);
    await interaction.editReply({
      embeds: [errorEmbed(i18n.t('ticket.error.transcript_failed', interaction.member.id))],
    });
  }
}

async function handleReopenTicket(interaction, ticket) {
  if (ticket.status !== 'closed') {
    return interaction.reply({
      embeds: [errorEmbed(i18n.t('ticket.error.already_open', interaction.member.id))],
      ephemeral: true,
    });
  }

  const { run } = getDb();
  run(`UPDATE tickets SET status = 'open', closed_at = NULL WHERE ticket_id = ?`, [ticket.ticket_id]);

  await interaction.channel.setName(interaction.channel.name.replace(/^closed-/, ''));

  await interaction.reply({
    embeds: [
      createEmbed({
        title: i18n.t('ticket.reopen.success_title', interaction.member.id),
        description: i18n.t('ticket.reopen.success_desc', interaction.member.id, { user: interaction.user }),
        color: config.embed.color.success,
      }),
    ],
  });

  await interaction.channel.permissionOverwrites.edit(ticket.creator_id, {
    SendMessages: true,
  });
}

async function handleDeleteTicket(interaction, ticket) {
  const confirmEmbed = createEmbed({
    title: i18n.t('ticket.delete.confirm_title', interaction.member.id),
    description: i18n.t('ticket.delete.confirm_desc', interaction.member.id),
    color: config.embed.color.error,
  });

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_confirm_delete_${ticket.ticket_id}`)
      .setLabel(i18n.t('ticket.delete.yes', interaction.member.id))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket_cancel_${ticket.ticket_id}`)
      .setLabel(i18n.t('ticket.delete.cancel', interaction.member.id))
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: false });
}

async function confirmDeleteTicket(interaction, ticket) {
  const { run } = getDb();
  run(`UPDATE tickets SET status = 'deleted' WHERE ticket_id = ?`, [ticket.ticket_id]);

  await interaction.reply({
    embeds: [successEmbed(i18n.t('ticket.delete.success', interaction.member.id))],
  });

  await logTicketAction(interaction.guild, i18n.t('ticket.log.deleted'), {
    ticketId: ticket.ticket_id,
    deletedBy: interaction.user,
  });

  await interaction.channel.delete();
}

async function handleTicketModal(interaction) {
  const modalId = interaction.customId;

  if (modalId.startsWith('ticket_adduser_modal_')) {
    const ticketId = modalId.replace('ticket_adduser_modal_', '');
    const userId = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
    const member = await interaction.guild.members.fetch(userId).catch(() => null);

    if (!member) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('ticket.error.user_not_found', interaction.member.id))],
        ephemeral: true,
      });
    }

    await interaction.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });

    await interaction.reply({
      embeds: [successEmbed(i18n.t('ticket.add.success', interaction.member.id, { member }))],
    });
  }

  if (modalId.startsWith('ticket_removeuser_modal_')) {
    const ticketId = modalId.replace('ticket_removeuser_modal_', '');
    const userId = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
    const member = await interaction.guild.members.fetch(userId).catch(() => null);

    if (!member) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('ticket.error.user_not_found', interaction.member.id))],
        ephemeral: true,
      });
    }

    await interaction.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: false,
    });

    await interaction.reply({
      embeds: [successEmbed(i18n.t('ticket.remove.success', interaction.member.id, { member }))],
    });
  }

  if (modalId.startsWith('ticket_rename_modal_')) {
    const ticketId = modalId.replace('ticket_rename_modal_', '');
    const newName = interaction.fields.getTextInputValue('new_name').toLowerCase().replace(/[^a-z0-9_-]/g, '');

    if (!newName) {
      return interaction.reply({
        embeds: [errorEmbed(i18n.t('ticket.error.invalid_name', interaction.member.id))],
        ephemeral: true,
      });
    }

    await interaction.channel.setName(newName);
    await interaction.reply({
      embeds: [successEmbed(i18n.t('ticket.rename.success', interaction.member.id, { name: newName }))],
    });
  }
}

async function logTicketAction(guild, action, data) {
  const logChannel = guild.channels.cache.get(config.ticket.logChannelId);
  if (!logChannel) return;

  const embed = createEmbed({
    title: `${config.emoji.ticket} ${action}`,
    color: action.includes(i18n.t('ticket.log.closed')) ? config.embed.color.error : config.embed.color.success,
    fields: [
      { name: i18n.t('ticket.log.field_ticket'), value: `\`${data.ticketId}\``, inline: true },
      ...(data.type ? [{ name: i18n.t('ticket.log.field_type'), value: data.type, inline: true }] : []),
      ...(data.creator
        ? [{ name: i18n.t('ticket.log.field_creator'), value: `${data.creator} (\`${data.creator.id}\`)`, inline: true }]
        : []),
      ...(data.claimedBy
        ? [{ name: i18n.t('ticket.log.field_claimed'), value: `${data.claimedBy} (\`${data.claimedBy.id}\`)`, inline: true }]
        : []),
      ...(data.closedBy
        ? [{ name: i18n.t('ticket.log.field_closed'), value: `${data.closedBy} (\`${data.closedBy.id}\`)`, inline: true }]
        : []),
      ...(data.deletedBy
        ? [{ name: i18n.t('ticket.log.field_deleted'), value: `${data.deletedBy} (\`${data.deletedBy.id}\`)`, inline: true }]
        : []),
      ...(data.channel
        ? [{ name: i18n.t('ticket.log.field_channel'), value: `${data.channel} (\`${data.channel.id}\`)`, inline: false }]
        : []),
    ],
    timestamp: new Date(),
  });

  await logChannel.send({ embeds: [embed] });
}

function scheduleInactivityCheck(channel, ticketId) {
  const INACTIVITY_WARNING = 24 * 60 * 60 * 1000;
  const INACTIVITY_CLOSE = 48 * 60 * 60 * 1000;

  setTimeout(async () => {
    try {
      const { get: g, run: r } = getDb();
      const ticket = g(`SELECT * FROM tickets WHERE ticket_id = ?`, [ticketId]);
      if (!ticket || ticket.status !== 'open') return;

      const lastMessage = (await channel.messages.fetch({ limit: 1 })).first();
      if (!lastMessage) return;

      const timeSinceLastMessage = Date.now() - lastMessage.createdTimestamp;

      if (timeSinceLastMessage > INACTIVITY_CLOSE) {
        await channel.send({
          embeds: [
            createEmbed({
              title: i18n.t('ticket.close.auto_title'),
              description: i18n.t('ticket.close.auto_desc'),
              color: config.embed.color.warning,
            }),
          ],
        });
        r(`UPDATE tickets SET status = 'closed' WHERE ticket_id = ?`, [ticketId]);
      } else if (timeSinceLastMessage > INACTIVITY_WARNING) {
        await channel.send({
          embeds: [
            createEmbed({
              title: i18n.t('ticket.inactivity.warning_title'),
              description: i18n.t('ticket.inactivity.warning_desc'),
              color: config.embed.color.warning,
            }),
          ],
        });
      }
    } catch (error) {
      logger.error('Inactivity check error:', error);
    }
  }, Math.max(INACTIVITY_WARNING, 60 * 1000));
}

async function handleEscalateTicket(interaction, ticket) {
  await interaction.reply({
    embeds: [
      createEmbed({
        title: i18n.t('ticket.escalate.success_title', interaction.member.id),
        description: i18n.t('ticket.escalate.success_desc', interaction.member.id),
        color: config.embed.color.warning,
      }),
    ],
  });

  const staffRoleId = config.ticket.staffRoleId;
  if (staffRoleId) {
    await interaction.channel.send({
      content: i18n.t('ticket.escalate.ping', null, { roleId: staffRoleId, user: interaction.user }),
      embeds: [
        createEmbed({
          title: i18n.t('ticket.escalate.notify_title'),
          description: i18n.t('ticket.escalate.notify_desc', null, { user: interaction.user }),
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
        title: i18n.t('ticket.resolved.success_title', interaction.member.id),
        description: i18n.t('ticket.resolved.success_desc', interaction.member.id),
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
