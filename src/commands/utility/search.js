const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config/client');
const logger = require('../../config/logger');
const { searchWeb } = require('../../utils/webSearch');
const { summarizeFromItems } = require('../../utils/summarizer');
const { aiSummarize } = require('../../utils/aiSummarizer');
const { askClaudeWithSearch, isConfigured: claudeConfigured } = require('../../utils/claudeAI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search the web and return the top results.')
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

    const tavilyKey = config.tavily?.apiKey || process.env.TAVILY_API_KEY;

    if (!tavilyKey) {
      const noKeyEmbed = new EmbedBuilder()
        .setTitle('Search Unavailable')
        .setColor(0xED4245)
        .setDescription('The search feature is currently disabled because the **Tavily API Key** is missing.\n\nTo enable it, please add `TAVILY_API_KEY` to your hosting variables.');
      return interaction.reply({ embeds: [noKeyEmbed], ephemeral: true });
    }

    await interaction.deferReply();

    try {
      // Primary: Use Claude AI if configured (it searches the web automatically)
      if (claudeConfigured()) {
        const claudeResult = await askClaudeWithSearch(query, num);
        if (claudeResult.answer) {
          const embed = new EmbedBuilder()
            .setTitle(`Answer: ${query}`)
            .setColor(config.embed.color.primary)
            .setDescription(claudeResult.answer)
            .setFooter({ text: `Powered by Claude AI` });

          if (claudeResult.searchResults && claudeResult.searchResults.length > 0) {
            for (let i = 0; i < Math.min(claudeResult.searchResults.length, num); i++) {
              const it = claudeResult.searchResults[i];
              const title = it.title || 'No title';
              const snippet = it.snippet ? it.snippet.replace(/\n/g, ' ') : '';
              const link = it.link || it.formattedUrl || '';
              const name = `${i + 1}. ${title}`.slice(0, 250);
              let value = snippet;
              if (link) value += `\n\n${link}`;
              value = value.slice(0, 1020);
              embed.addFields({ name, value });
            }
          }

          const buttons = [];
          if (claudeResult.searchResults) {
            for (let i = 0; i < Math.min(claudeResult.searchResults.length, num, 5); i++) {
              const it = claudeResult.searchResults[i];
              const label = (it.title || it.formattedUrl || `Source ${i + 1}`).slice(0, 80);
              const url = it.link || it.formattedUrl || null;
              if (url) buttons.push(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));
            }
          }

          const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
          return interaction.editReply({ embeds: [embed], components });
        }
      }

      // Fallback: Search web
      const { items, searchInformation } = await searchWeb(query, num);

      if (searchInformation?.error) {
        const embed = new EmbedBuilder()
          .setTitle(`Search: ${query}`)
          .setColor('#FF0000');
        
        let errorDesc = `⚠️ I encountered an issue while searching (Error ${searchInformation.error}). A staff member will be with you shortly!`;
        
        if (searchInformation.error === 403 && (searchInformation.errorText?.includes('SERVICE_DISABLED') || searchInformation.errorText?.includes('accessNotConfigured'))) {
          errorDesc = `⚠️ **Search API Configuration Issue.**
          
          The bot is having trouble accessing the search service. Please check:
          
          1. **Tavily API Key:** Ensure this is set in your hosting variables.
          
          A staff member will assist you shortly!`;
        }
        
        embed.setDescription(errorDesc);
        return interaction.editReply({ embeds: [embed] });
      }

      const source = searchInformation?.source ? (searchInformation.source.charAt(0).toUpperCase() + searchInformation.source.slice(1)) : 'Web';
      const embed = new EmbedBuilder()
        .setTitle(`Search results for: ${query}`)
        .setColor(config.embed.color.primary)
        .setFooter({ text: `Powered by ${source}` });

      if (items.length === 0) {
        embed.setDescription(`No results found for **${query}** on ${source}.`);
        return interaction.editReply({ embeds: [embed] });
      }

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

      let summary = null;

      if (claudeConfigured()) {
        const claudeResult = await askClaudeWithSearch(query, num);
        if (claudeResult.answer) {
          summary = claudeResult.answer;
        }
      }

      if (!summary) {
        summary = await aiSummarize(query, items);
      }
      if (!summary) {
        summary = summarizeFromItems(items, 400);
      }

      if (summary) {
        embed.setDescription(summary);
      } else {
        embed.setDescription('I couldn\'t find a quick answer, but I found some helpful links for you:');
      }

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

      if ((searchInformation?.totalResults || 0) > num) {
        embed.addFields({ name: '\u200b', value: `Showing top ${num} results.` });
      }

      await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      logger.error('Failed to perform web search:', error);
      try {
        await interaction.editReply({ content: 'An error occurred while searching. Please try again later.' });
      } catch {}
    }
  },
};

