const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config/client');
const logger = require('../../config/logger');
const { searchGoogle } = require('../../utils/googleSearch');
const { summarizeFromItems } = require('../../utils/summarizer');
const { aiSummarize } = require('../../utils/aiSummarizer');

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

      if (searchInformation?.error) {
        const embed = new EmbedBuilder()
          .setTitle(`Search: ${query}`)
          .setColor('#FF0000');
        
        let errorDesc = `⚠️ I encountered an issue while searching (Error ${searchInformation.error}). A staff member will be with you shortly!`;
        
        // Specifically handle the "service disabled" 403 error
        if (searchInformation.error === 403 && (searchInformation.errorText?.includes('SERVICE_DISABLED') || searchInformation.errorText?.includes('accessNotConfigured'))) {
          errorDesc = `⚠️ **Search API Configuration Issue.**
          
          The bot is having trouble accessing the search service. Please check:
          
          1. **Tavily API Key:** Ensure this is set in your hosting variables (Highly Recommended).
          2. **Google API:** If using Google, ensure the API is enabled and billing is linked.
          
          A staff member will assist you shortly!`;
        }
        
        embed.setDescription(errorDesc);
        return interaction.editReply({ embeds: [embed] });
      }

      // Build embed with top results
      const source = searchInformation?.source === 'google' ? 'Google' : (searchInformation?.source === 'tavily' ? 'Tavily' : 'Web');
      const embed = new EmbedBuilder()
        .setTitle(`Search results for: ${query}`)
        .setColor(config.embed.color.primary)
        .setFooter({ text: `Powered by ${source}` });

      if (items.length === 0) {
        embed.setDescription(`No results found for **${query}** on ${source}.
        
        *Tip: If you're using Google and not getting results, ensure your Search Engine ID (CX) is configured to "Search the entire web".*`);
        return interaction.editReply({ embeds: [embed] });
      }

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
      let summary = await aiSummarize(query, items);
      if (!summary) {
        summary = summarizeFromItems(items, 400);
      }

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

