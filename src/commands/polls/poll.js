const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { getDb } = require('../../database/database');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll for users to vote on.')
    .addStringOption((option) =>
      option.setName('question')
        .setDescription('The poll question.')
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option.setName('option1')
        .setDescription('Option 1 (left side).')
        .setRequired(true)
        .setMaxLength(80)
    )
    .addStringOption((option) =>
      option.setName('option2')
        .setDescription('Option 2 (right side).')
        .setRequired(true)
        .setMaxLength(80)
    )
    .addIntegerOption((option) =>
      option.setName('duration')
        .setDescription('Duration in minutes (default 60, max 1440).')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(1440)
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question');
    const option1 = interaction.options.getString('option1');
    const option2 = interaction.options.getString('option2');
    const duration = interaction.options.getInteger('duration') || 60;

    const embed = createEmbed({
      title: `${config.emoji.poll} Poll`,
      description: question,
      color: config.embed.color.primary,
      author: {
        name: interaction.user.tag,
        iconURL: interaction.user.displayAvatarURL(),
      },
      fields: [
        { name: '✅ Option 1', value: option1, inline: true },
        { name: '❌ Option 2', value: option2, inline: true },
      ],
      timestamp: new Date(),
    });

    const vote1Btn = new ButtonBuilder()
      .setCustomId('poll_vote_1')
      .setLabel(option1)
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✅');

    const vote2Btn = new ButtonBuilder()
      .setCustomId('poll_vote_2')
      .setLabel(option2)
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌');

    const row = new ActionRowBuilder().addComponents(vote1Btn, vote2Btn);

    const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

    // Save poll to database
    const { run } = getDb();
    run(
      'INSERT INTO polls (message_id, channel_id, guild_id, question, options) VALUES (?, ?, ?, ?, ?)',
      [message.id, interaction.channel.id, interaction.guild.id, question, JSON.stringify([option1, option2])]
    );

    // Auto-finalize after duration
    setTimeout(async () => {
      try {
        const msg = await interaction.channel.messages.fetch(message.id).catch(() => null);
        if (!msg) return;

        // Count votes from button clicks stored in the database
        // For simplicity, we fetch the message and count reactions
        const fetchedMsg = await interaction.channel.messages.fetch(message.id);
        const reactions = fetchedMsg.reactions.cache;

        // Disable buttons
        const disabledRow = new ActionRowBuilder().addComponents(
          vote1Btn.setDisabled(true),
          vote2Btn.setDisabled(true)
        );

        const finalEmbed = createEmbed({
          title: `${config.emoji.poll} Poll Ended`,
          description: question,
          color: config.embed.color.success,
          fields: [
            { name: '✅ Option 1', value: `${option1}`, inline: true },
            { name: '❌ Option 2', value: `${option2}`, inline: true },
          ],
          timestamp: new Date(),
        });

        await fetchedMsg.edit({ embeds: [finalEmbed], components: [disabledRow] });
      } catch (error) {
        // Poll may have been deleted
      }
    }, duration * 60 * 1000);
  },
};
