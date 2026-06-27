const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot\'s latency.'),

  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;

    const embed = createEmbed({
      title: '🏓 Pong!',
      color: config.embed.color.primary,
      fields: [
        { name: 'Roundtrip', value: `${roundtrip}ms`, inline: true },
        { name: 'WebSocket', value: `${interaction.client.ws.ping}ms`, inline: true },
      ],
    });

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};
