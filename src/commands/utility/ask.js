const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config/client');
const logger = require('../../config/logger');
const { askClaudeWithSearch, askClaude } = require('../../utils/claudeAI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask Claude AI anything! Searches the web if needed.')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('What do you want to know?')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option.setName('web_search')
        .setDescription('Search the web for up-to-date info (default: true)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question', true);
    const webSearch = interaction.options.getBoolean('web_search') ?? true;

    if (!config.ai?.apiKey && !process.env.AI_API_KEY) {
      const embed = new EmbedBuilder()
        .setTitle('Claude AI Unavailable')
        .setColor(config.embed.color.error)
        .setDescription('The AI feature is disabled because no **AI API Key** is configured.\n\nAsk an admin to set `AI_API_KEY` in the environment variables.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (config.ai?.provider !== 'claude' && process.env.AI_PROVIDER && process.env.AI_PROVIDER !== 'claude') {
      const embed = new EmbedBuilder()
        .setTitle('Claude AI Unavailable')
        .setColor(config.embed.color.warning)
        .setDescription(`The AI provider is set to **${config.ai?.provider || process.env.AI_PROVIDER}**, not Claude.\n\nTo use this command, set \`AI_PROVIDER=claude\` in your environment.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.deferReply();

    try {
      let answer;
      let searchNote = '';

      if (webSearch) {
        const result = await askClaudeWithSearch(question, 5);
        answer = result.answer;
        if (result.searchResults && result.searchResults.length > 0) {
          searchNote = `\n\n🔍 *Searched the web for current info*`;
        }
      } else {
        answer = await askClaude(question);
      }

      if (!answer) {
        const embed = new EmbedBuilder()
          .setTitle('No Answer Available')
          .setColor(config.embed.color.warning)
          .setDescription("I couldn't generate an answer right now. Please try again later.");
        return interaction.editReply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setTitle(`Q: ${question.length > 200 ? question.slice(0, 200) + '...' : question}`)
        .setColor(config.embed.color.primary)
        .setDescription(answer + searchNote)
        .setFooter({ text: `Powered by Claude AI (${config.ai?.model || process.env.AI_MODEL || 'claude-3-5-sonnet'})` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Ask command failed:', error);
      try {
        await interaction.editReply({ content: 'An error occurred while processing your question. Please try again later.' });
      } catch {}
    }
  },
};
