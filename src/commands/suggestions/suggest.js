const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, successEmbed, errorEmbed } = require('../../utils/embeds');
const { getDb } = require('../../database/database');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a suggestion for the server.')
    .addStringOption((option) =>
      option.setName('suggestion')
        .setDescription('Your suggestion.')
        .setRequired(true)
        .setMaxLength(2000)
    ),

  async execute(interaction) {
    const suggestionContent = interaction.options.getString('suggestion');
    const channel = interaction.guild.channels.cache.get(config.suggestions.channelId);

    if (!channel) {
      return interaction.reply({
        embeds: [errorEmbed('Suggestions channel is not configured.')],
        ephemeral: true,
      });
    }

    const embed = createEmbed({
      title: `${config.emoji.suggestion} Suggestion`,
      description: suggestionContent,
      color: config.embed.color.primary,
      author: {
        name: interaction.user.tag,
        iconURL: interaction.user.displayAvatarURL(),
      },
      fields: [
        { name: 'Status', value: '⏳ Pending Review', inline: true },
        { name: 'Votes', value: '👍 0 | 👎 0', inline: true },
      ],
      timestamp: new Date(),
    });

    const approveBtn = new ButtonBuilder()
      .setCustomId('suggest_approve')
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');

    const rejectBtn = new ButtonBuilder()
      .setCustomId('suggest_reject')
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌');

    const row = new ActionRowBuilder().addComponents(approveBtn, rejectBtn);

    const message = await channel.send({ embeds: [embed], components: [row] });

    // Add vote reactions
    await message.react('👍');
    await message.react('👎');

    // Save to database
    const { run } = getDb();
    run(
      'INSERT INTO suggestions (message_id, channel_id, guild_id, author_id, content) VALUES (?, ?, ?, ?, ?)',
      [message.id, channel.id, interaction.guild.id, interaction.user.id, suggestionContent]
    );

    await interaction.reply({
      embeds: [successEmbed(`Your suggestion has been submitted in ${channel}.`)],
      ephemeral: true,
    });
  },
};
