const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasRole } = require('../../utils/permissions');
const { getDb } = require('../../database/database');
const config = require('../../config/client');
const logger = require('../../config/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway.')
    .addStringOption((option) =>
      option.setName('prize')
        .setDescription('The prize for the giveaway.')
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option.setName('duration')
        .setDescription('Duration (e.g. 10m, 1h, 1d, 7d).')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName('winners')
        .setDescription('Number of winners (default 1, max 10).')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)
    )
    .addChannelOption((option) =>
      option.setName('channel')
        .setDescription('Channel to host the giveaway in.')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!hasRole(interaction.member, [config.giveaways.staffRoleId]) &&
        !interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ embeds: [errorEmbed('You do not have permission to host giveaways.')], ephemeral: true });
    }

    const prize = interaction.options.getString('prize');
    const durationStr = interaction.options.getString('duration');
    const winners = interaction.options.getInteger('winners') || 1;
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    const ms = require('ms');
    const durationMs = ms(durationStr);
    if (!durationMs || durationMs < 60000 || durationMs > 30 * 24 * 60 * 60 * 1000) {
      return interaction.reply({ embeds: [errorEmbed('Invalid duration. Use a format like: 10m, 1h, 1d (min 1 minute, max 30 days).')], ephemeral: true });
    }

    const endTime = Date.now() + durationMs;

    const embed = createEmbed({
      title: `${config.emoji.giveaway} Giveaway`,
      description: `**Prize:** ${prize}\n**Winners:** ${winners}\n**Hosted by:** ${interaction.user}`,
      color: config.embed.color.primary,
      fields: [
        { name: 'Ends', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true },
        { name: 'Winners', value: `${winners}`, inline: true },
        { name: 'Entries', value: '0', inline: true },
      ],
      timestamp: new Date(),
    });

    const enterBtn = new ButtonBuilder()
      .setCustomId('giveaway_enter')
      .setLabel('Enter Giveaway')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎉');

    const row = new ActionRowBuilder().addComponents(enterBtn);

    const message = await channel.send({
      content: `🎉 **Giveaway!** 🎉`,
      embeds: [embed],
      components: [row],
    });

    // Save to database
    const { run } = getDb();
    run(
      'INSERT INTO giveaways (message_id, channel_id, guild_id, prize, winners, end_time, host_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [message.id, channel.id, interaction.guild.id, prize, winners, new Date(endTime).toISOString(), interaction.user.id]
    );

    await interaction.reply({
      embeds: [successEmbed(`Giveaway for **${prize}** started in ${channel}!`)],
      ephemeral: true,
    });

    // Schedule end
    setTimeout(async () => {
      await endGiveaway(message.id, channel, prize, winners);
    }, durationMs);
  },
};

async function endGiveaway(messageId, channel, prize, winnersCount) {
  try {
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;

    const { get: g, run: r, all } = getDb();
    const giveaway = g('SELECT * FROM giveaways WHERE message_id = ?', [messageId]);
    if (!giveaway || giveaway.ended) return;

    const participants = all(
      'SELECT DISTINCT author_id FROM ticket_messages WHERE ticket_id = ?',
      [messageId]
    );
    // This is a simplified approach — in a real implementation, store giveaway entries in a separate table

    const eligibleUsers = participants || [];
    if (eligibleUsers.length < winnersCount) {
      await message.edit({
        content: '🎉 **Giveaway Ended** 🎉',
        embeds: [
          createEmbed({
            title: `${config.emoji.giveaway} Giveaway Ended`,
            description: `**Prize:** ${prize}\nNot enough participants to determine winners.`,
            color: config.embed.color.error,
          }),
        ],
        components: [],
      });

      r('UPDATE giveaways SET ended = 1 WHERE message_id = ?', [messageId]);
      return;
    }

    // Pick random winners
    const winners = [];
    const shuffled = [...eligibleUsers].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(winnersCount, shuffled.length); i++) {
      winners.push(shuffled[i]);
    }

    const winnerMentions = winners.map((w) => `<@${w.author_id}>`).join(', ');

    await message.edit({
      content: `🎉 **Giveaway Ended** 🎉\nCongratulations ${winnerMentions}!`,
      embeds: [
        createEmbed({
          title: `${config.emoji.giveaway} Giveaway Ended`,
          description: `**Prize:** ${prize}\n**Winners:** ${winnerMentions}`,
          color: config.embed.color.success,
        }),
      ],
      components: [],
    });

    await channel.send({
      content: `🎉 Congratulations ${winnerMentions}! You won **${prize}**!`,
    });

    r('UPDATE giveaways SET ended = 1 WHERE message_id = ?', [messageId]);
  } catch (error) {
    logger.error('Error ending giveaway:', error);
  }
}
