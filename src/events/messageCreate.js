const { checkAutoMod, handleAutoMod } = require('../moderation/autoMod');
const logger = require('../config/logger');

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
  },
};
