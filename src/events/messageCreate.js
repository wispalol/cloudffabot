const { checkAutoMod, handleAutoMod } = require('../moderation/autoMod');
const logger = require('../config/logger');
const { searchWeb } = require('../utils/webSearch');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { summarizeFromItems } = require('../utils/summarizer');
const { aiSummarize } = require('../utils/aiSummarizer');
const { askClaudeWithSearch, askClaude } = require('../utils/claudeAI');
const { findFaqEntry, formatFaqList } = require('../utils/faq');
const { createEmbed } = require('../utils/embeds');
const config = require('../config/client');

// Simple per-user cooldown to prevent abuse of message-based searches
const searchCooldown = new Map(); // userId -> timestamp (ms)
const SEARCH_COOLDOWN_MS = 10 * 1000; // 10s

// Per-channel cooldown for auto-answers (prevents spam in busy channels)
const channelCooldown = new Map(); // channelId -> timestamp (ms)
const CHANNEL_COOLDOWN_MS = 30 * 1000; // 30s between auto-answers per channel

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    // Ignore DMs and bot messages
    if (!message.guild || message.author.bot) return;

    // ─── Auto-Moderation Check ──────────────────────────
    try {
      const result = checkAutoMod(message);
      if (result) {
        await handleAutoMod(message, result);
        return;
      }
    } catch (error) {
      logger.error('Auto-mod error:', error);
    }

    // Quick message-based search: '!g query' or '!search query'
    try {
      const content = message.content.trim();
      const lower = content.toLowerCase();
      const prefixG = lower.startsWith('!g ');
      const prefixSearch = lower.startsWith('!search ');
      if (prefixG || prefixSearch) {
        const now = Date.now();
        const last = searchCooldown.get(message.author.id) || 0;
        if (now - last < SEARCH_COOLDOWN_MS) {
          // ignore to avoid spamming
          return;
        }
        searchCooldown.set(message.author.id, now);

        const query = content.split(' ').slice(prefixG ? 1 : 1).join(' ').trim();
        if (!query) return;

        // Inform user we're searching
        const replyMsg = await message.reply({ content: `Searching for: **${query}**...` });

        try {
          const { items, searchInformation } = await searchWeb(query, 3);
          
          if (searchInformation?.error) {
            const embed = new EmbedBuilder()
              .setTitle(`Search: ${query}`)
              .setColor('#FF0000');
            
            let errorDesc = `⚠️ I encountered an error (Error ${searchInformation.error}) while searching. A staff member will be with you shortly!`;
            
            // Specifically handle the "service disabled" 403 error
            if (searchInformation.error === 403 && (searchInformation.errorText?.includes('SERVICE_DISABLED') || searchInformation.errorText?.includes('accessNotConfigured'))) {
              errorDesc = `⚠️ **Search API Configuration Issue.**
              
              The bot is having trouble accessing the search service. Please check:
              
              1. **Tavily API Key:** Ensure this is set in your hosting variables.
              
              A staff member will assist you shortly!`;
            }
            
            embed.setDescription(errorDesc);
            return replyMsg.edit({ content: null, embeds: [embed] });
          }

          if (!items || items.length === 0) {
            const embed = new EmbedBuilder()
              .setTitle(`Search results for: ${query}`)
              .setColor('#5865F2')
              .setDescription(`No results found for **${query}**.`);
            
            return replyMsg.edit({ content: null, embeds: [embed] });
          }

          const embed = new EmbedBuilder()
            .setTitle(`Search results for: ${query}`)
            .setColor('#5865F2');

          if (searchInformation?.source) {
            const source = searchInformation.source.charAt(0).toUpperCase() + searchInformation.source.slice(1);
            embed.setFooter({ text: `Results from ${source}` });
          } else {
            embed.setFooter({ text: 'Powered by search provider' });
          }

          let summary = await aiSummarize(query, items);
          if (!summary) {
            summary = summarizeFromItems(items, 400);
          }

          if (summary) {
            embed.setDescription(summary);
          } else {
            embed.setDescription(`I found some resources for **${query}** that might help:`);
          }

          for (let i = 0; i < Math.min(items.length, 3); i++) {
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

          const buttons = [];
          for (let i = 0; i < Math.min(items.length, 3, 5); i++) {
            const it = items[i];
            const label = (it.title || it.formattedUrl || `Result ${i + 1}`).slice(0, 80);
            const url = it.link || it.formattedUrl || null;
            if (url) buttons.push(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));
          }

          const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];

          await replyMsg.edit({ content: null, embeds: [embed], components });
        } catch (err) {
          logger.error('Message search failed:', err);
          try { await replyMsg.edit({ content: 'Search failed — please try again later.' }); } catch {}
        }
      }
    } catch (err) {
      logger.error('Quick search handler error:', err);
    }

    // Auto-answer simple questions and help requests — works in ALL channels
    try {
      const content2 = message.content.trim();
      if (content2.length > 300) return;

      const cleanContent = content2.replace(/<@!?\d+>/g, '').trim().toLowerCase();

      const isLikelyQuestion = (() => {
        if (cleanContent.endsWith('?') && cleanContent.length > 5) return true;
        const questionStarters = /^(who|what|when|where|why|how|is|are|do|does|did|can|could|should|would|will|how to|how do i|can i|where is)\b/i;
        if (questionStarters.test(cleanContent) && cleanContent.split(' ').length >= 3) return true;
        const helpPhrases = /^(help|i need|i want|i have|i'm looking|does anyone|can anyone|anyone know|i have a)\b/i;
        return helpPhrases.test(cleanContent) && cleanContent.split(' ').length >= 3;
      })();

      if (!isLikelyQuestion) return;

      const isMentioned = message.mentions.has(message.client.user);

      // Check FAQ first (fast, no API cost)
      const faqEntry = findFaqEntry(cleanContent);
      if (faqEntry) {
        if (!faqEntry.triggerSearch) {
          const now = Date.now();
          const lastUser = searchCooldown.get(message.author.id) || 0;
          if (now - lastUser < SEARCH_COOLDOWN_MS) return;
          searchCooldown.set(message.author.id, now);

          const embed = createEmbed({
            title: `💡 ${faqEntry.category}`,
            description: faqEntry.answer,
            color: config.embed.color.primary,
            footerText: 'Was this helpful? Feel free to ask more!',
          });
          await message.reply({ embeds: [embed] });
          return;
        }
        // triggerSearch entries fall through to web search
      }

      // Check channel cooldown for non-mentioned auto-answers
      if (!isMentioned) {
        const channelLast = channelCooldown.get(message.channel.id) || 0;
        const now = Date.now();
        if (now - channelLast < CHANNEL_COOLDOWN_MS) return;
        channelCooldown.set(message.channel.id, now);
      }

      // User cooldown for web search
      const now = Date.now();
      const last = searchCooldown.get(message.author.id) || 0;
      if (now - last < SEARCH_COOLDOWN_MS) return;
      searchCooldown.set(message.author.id, now);

      const query = content2.replace(/<@!?\d+>/g, '').replace(/\?+$/, '').trim();
      if (!query || query.length < 5) return;

      const replyMsg = await message.reply({ content: `Let me look that up for you: **${query}**...` });
      try {
        const { items, searchInformation } = await searchWeb(query, 3);

        if (searchInformation?.error) {
          const embed = new EmbedBuilder()
            .setTitle(`Answer: ${query}`)
            .setColor('#FF0000');

          let errorDesc = `⚠️ I encountered an error (Error ${searchInformation.error}) while searching. A staff member will be with you shortly!`;

          if (searchInformation.error === 403 && (searchInformation.errorText?.includes('SERVICE_DISABLED') || searchInformation.errorText?.includes('accessNotConfigured'))) {
            errorDesc = `⚠️ **Search API Configuration Issue.**

            The bot is having trouble accessing the search service. Please check:

            1. **Tavily API Key:** Ensure this is set in your hosting variables.

            A staff member will assist you shortly!`;
          }

          embed.setDescription(errorDesc);
          return replyMsg.edit({ content: null, embeds: [embed] });
        }

        if (!items || items.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle(`Answer: ${query}`)
            .setColor('#5865F2')
            .setDescription(`I couldn't find an answer for **${query}**.\n\n📚 Try \`/faq\` to search common topics\n🎫 Open a ticket in **#tickets** for personalized help`);

          return replyMsg.edit({ content: null, embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setTitle(`Answer: ${query}`)
          .setColor('#5865F2');

        if (searchInformation?.source) {
          const source = searchInformation.source.charAt(0).toUpperCase() + searchInformation.source.slice(1);
          embed.setFooter({ text: `Results from ${source}` });
        } else {
          embed.setFooter({ text: 'Powered by search provider' });
        }

        const aiProvider = config.ai?.provider || process.env.AI_PROVIDER;
        const aiKey = config.ai?.apiKey || process.env.AI_API_KEY;

        let summary = null;
        if (aiProvider === 'claude' && aiKey) {
          const claudeResult = await askClaudeWithSearch(query, 3);
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
          embed.setDescription(`I found some resources for **${query}** that might help:`);
        }

        for (let i = 0; i < Math.min(items.length, 3); i++) {
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

        const buttons = [];
        for (let i = 0; i < Math.min(items.length, 3, 5); i++) {
          const it = items[i];
          const label = (it.title || it.formattedUrl || `Result ${i + 1}`).slice(0, 80);
          const url = it.link || it.formattedUrl || null;
          if (url) buttons.push(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));
        }

        const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
        await replyMsg.edit({ content: null, embeds: [embed], components });
      } catch (err) {
        logger.error('Auto-search failed:', err);
        try {
          await replyMsg.edit({ content: 'Sorry — I failed to look that up. Try again later.' });
        } catch {}
      }
    } catch (err) {
      logger.error('Auto-answer handler error:', err);
    }
  },
};
