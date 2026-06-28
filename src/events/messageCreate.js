const { checkAutoMod, handleAutoMod } = require('../moderation/autoMod');
const logger = require('../config/logger');
const { searchGoogle } = require('../utils/googleSearch');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { summarizeFromItems } = require('../utils/summarizer');

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

        // Inform user we're searching
        const replyMsg = await message.reply({ content: `Searching for: **${query}**...` });

        try {
          const { items } = await searchGoogle(query, 3);
          if (!items || items.length === 0) {
            return replyMsg.edit(`No results found for **${query}**.`);
          }

          const embed = new EmbedBuilder()
            .setTitle(`Search results for: ${query}`)
            .setColor('#5865F2')
            .setFooter({ text: 'Powered by search provider' });

          const summary = summarizeFromItems(items, 400);
          if (summary) embed.setDescription(summary);

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

    // Auto-answer simple questions without prefix
    try {
      const content2 = message.content.trim();
      // Ignore very long messages
      if (content2.length > 300) return;

      const isLikelyQuestion = (() => {
        if (content2.includes('?')) return true;
        // Starts with common question words
        return /^(who|what|when|where|why|how|is|are|do|does|did|can|could|should|would|will)\b/i.test(content2);
      })();

      if (isLikelyQuestion) {
        const now = Date.now();
        const last = searchCooldown.get(message.author.id) || 0;
        if (now - last < SEARCH_COOLDOWN_MS) return; // respect cooldown
        searchCooldown.set(message.author.id, now);

        const query = content2.replace(/\?+$/, '').trim();
        if (!query) return;

        const replyMsg = await message.reply({ content: `Let me look that up for you: **${query}**...` });
        try {
          const { items } = await searchGoogle(query, 3);
          if (!items || items.length === 0) {
            return replyMsg.edit(`I couldn't find anything for **${query}**.`);
          }

          const embed = new EmbedBuilder()
            .setTitle(`Answer: ${query}`)
            .setColor('#5865F2')
            .setFooter({ text: 'Powered by search provider' });

          const summary = summarizeFromItems(items, 400);
          if (summary) embed.setDescription(summary);

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
          try { await replyMsg.edit({ content: 'Sorry — I failed to look that up. Try again later.' }); } catch {}
        }
      }
    } catch (err) {
      logger.error('Auto-answer handler error:', err);
    }
  },
};
