const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config/client');
const logger = require('../../config/logger');
const { searchGoogle } = require('../../utils/googleSearch');
const { summarizeFromItems } = require('../../utils/summarizer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search Google and return the top results.')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('What to search for')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('num')
        .setDescription('Number of results (1-5)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(5)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query', true);
    const num = interaction.options.getInteger('num') || 3;

    const apiKey = config.search?.apiKey || process.env.GOOGLE_API_KEY;
    const cx = config.search?.cx || process.env.GOOGLE_CX;
    const tavilyKey = config.tavily?.apiKey || process.env.TAVILY_API_KEY;

    if (!apiKey && !cx && !tavilyKey) {
      // If no keys at all, we can still fall back to DDG in searchGoogle, 
      // but let's at least check if some config exists or warn user.
      // Actually, searchGoogle has DDG as hard fallback, so we can allow it.
    }

    await interaction.deferReply();

    try {
      const { items, searchInformation } = await searchGoogle(query, num);

      if (items.length === 0) {
        return interaction.editReply({ content: `No results found for **${query}**.` });
      }

      // Build embed with top results
      const source = searchInformation?.source === 'google' ? 'Google' : (searchInformation?.source === 'tavily' ? 'Tavily' : 'DuckDuckGo');
      const embed = new EmbedBuilder()
        .setTitle(`Search results for: ${query}`)
        .setColor(config.embed.color.primary)
        .setFooter({ text: `Powered by ${source}` });

      // Add as fields (title as linked name, snippet + link in value)
      for (let i = 0; i < Math.min(items.length, num); i++) {
        const it = items[i];
        const title = it.title || 'No title';
        const snippet = it.snippet ? it.snippet.replace(/\n/g, ' ') : '';
        const link = it.link || it.formattedUrl || '';

        const name = `${i + 1}. ${title}`.slice(0, 250);
        let value = snippet;
        if (link) value += `\n\n${link}`;
        value = value.slice(0, 1020);

        embed.addFields({ name, value });
      }

      // Build a short synthesized answer and show it above the results
      const summary = summarizeFromItems(items, 400);
      if (summary) {
        embed.setDescription(summary);
      } else {
        embed.setDescription('I couldn\'t find a quick answer, but I found some helpful links for you:');
      }

      // Build buttons for quick open (max 5)
      const buttons = [];
      for (let i = 0; i < Math.min(items.length, num, 5); i++) {
        const it = items[i];
        const label = (it.title || it.formattedUrl || `Result ${i + 1}`).slice(0, 80);
        const url = it.link || it.formattedUrl || null;
        if (url) {
          buttons.push(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));
        }
      }

      const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];

      // If there are more results than we showed, include quick note
      if ((searchInformation?.totalResults || 0) > num) {
        embed.addFields({ name: '\u200b', value: `Showing top ${num} results. View more on Google.` });
      }

      await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      logger.error('Failed to perform Google search:', error);
      try {
        await interaction.editReply({ content: 'An error occurred while searching. Please try again later.' });
      } catch {}
    }
  },
};

