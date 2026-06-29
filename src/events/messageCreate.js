const { checkAutoMod, handleAutoMod } = require('../moderation/autoMod');
const logger = require('../config/logger');
const { searchWeb } = require('../utils/webSearch');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { summarizeFromItems } = require('../utils/summarizer');
const { aiSummarize } = require('../utils/aiSummarizer');
const { askClaudeWithSearch, askClaude, isConfigured: claudeConfigured } = require('../utils/claudeAI');
const { isQuerySafe, getBlockedMessage } = require('../utils/safetyFilter');

const config = require('../config/client');

// Simple per-user cooldown to prevent abuse of message-based searches
const searchCooldown = new Map(); // userId -> timestamp (ms)
const SEARCH_COOLDOWN_MS = 10 * 1000; // 10s



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

        // ─── Safety Filter ─────────────────────────────
        if (!isQuerySafe(query)) {
          const blocked = getBlockedMessage();
          const embed = new EmbedBuilder()
            .setTitle(blocked.title)
            .setColor(0xED4245)
            .setDescription(blocked.description);
          return message.reply({ embeds: [embed] });
        }

        // Inform user we're searching
        const replyMsg = await message.reply({ content: `👋 **Hello!** How can we help you today? If you need anything, simply ask me and I'll search it up for you. I'm here to help! Let me look into: **${query}**...` });

        try {
          // Primary: Use Claude AI if configured
          if (claudeConfigured()) {
            const claudeResult = await askClaudeWithSearch(query, 3);
            if (claudeResult.answer) {
              const embed = new EmbedBuilder()
                .setTitle(`Answer: ${query}`)
                .setColor(config.embed.color.primary)
                .setDescription(claudeResult.answer)
                .setFooter({ text: `Powered by Claude AI` });

              if (claudeResult.searchResults && claudeResult.searchResults.length > 0) {
                for (let i = 0; i < Math.min(claudeResult.searchResults.length, 3); i++) {
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
                for (let i = 0; i < Math.min(claudeResult.searchResults.length, 3, 5); i++) {
                  const it = claudeResult.searchResults[i];
                  const label = (it.title || it.formattedUrl || `Source ${i + 1}`).slice(0, 80);
                  const url = it.link || it.formattedUrl || null;
                  if (url) buttons.push(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));
                }
              }
              const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
              return replyMsg.edit({ content: null, embeds: [embed], components });
            }
          }

          // Fallback: Search web
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

    // ─── Server IP Lookup ───────────────────────────────
    try {
      const content = message.content.trim().toLowerCase();
      const ipKeywords = ['ip', 'server ip', 'join ip', 'what is the ip', 'server address', 'how do i join', 'how to join', 'connect ip'];
      const matchesIp = ipKeywords.some(kw => content.includes(kw));
      if (matchesIp && content.length < 200) {
        const now = Date.now();
        const last = searchCooldown.get(message.author.id) || 0;
        if (now - last < SEARCH_COOLDOWN_MS) return;
        searchCooldown.set(message.author.id, now);

        const embed = new EmbedBuilder()
          .setTitle('🌍 Server IPs by Region')
          .setColor(config.embed.color.primary)
          .setDescription('What region are you in? Here are all our server IPs:')
          .addFields(
            { name: '🇬🇧 UK', value: '`51.195.188.185:7001`', inline: false },
            { name: '🇺🇸 NA West', value: '`67.222.135.60:7024`', inline: false },
            { name: '🇺🇸 NA East', value: '`172.240.13.115:25660`', inline: false },
            { name: '🇪🇺 EU Central', value: '`104.128.51.155:25600`', inline: false },
            { name: '🇺🇸 NA Central', value: '`185.206.148.75:25543`', inline: false },
          )
          .setFooter({ text: 'Choose the region closest to you for the best connection!' });

        return message.reply({ embeds: [embed] });
      }
    } catch (err) {
      logger.error('IP lookup handler error:', err);
    }
  },
};