const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { findFaqEntry, formatFaqList } = require('../../utils/faq');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('faq')
    .setDescription('Search the FAQ or list all topics.')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('What do you want to know about?')
        .setRequired(false)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');

    if (!query) {
      const embed = new EmbedBuilder()
        .setTitle('📚 FAQ — Available Topics')
        .setColor(config.embed.color.primary)
        .setDescription(formatFaqList())
        .setFooter({ text: 'Use /faq <topic> to get an answer.' });

      return interaction.reply({ embeds: [embed] });
    }

    const entry = findFaqEntry(query.toLowerCase());

    if (!entry) {
      const embed = new EmbedBuilder()
        .setTitle('📚 FAQ')
        .setColor(config.embed.color.warning)
        .setDescription(`I don't have an FAQ entry for **${query}**. Try \`/faq\` to see all topics, or use \`/search\` to look it up online.`);

      return interaction.reply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
      .setTitle(`💡 ${entry.category}`)
      .setColor(config.embed.color.primary)
      .setDescription(entry.answer)
      .setFooter({ text: 'Was this helpful? Feel free to ask more!' });

    await interaction.reply({ embeds: [embed] });
  },
};
