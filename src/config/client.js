/**
 * Central configuration module.
 * All configurable values are read from environment variables.
 * DO NOT hardcode IDs here — use .env instead.
 */

const config = {
  // ─── Discord ───────────────────────────────────────────
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  language: process.env.LANGUAGE || 'en',

  // ─── Ticket System ─────────────────────────────────────
  ticket: {
    categoryId: process.env.TICKET_CATEGORY_ID,
    staffRoleId: process.env.TICKET_STAFF_ROLE_ID,
    adminRoleId: process.env.TICKET_ADMIN_ROLE_ID,
    managerRoleId: process.env.TICKET_MANAGER_ROLE_ID,
    logChannelId: process.env.TICKET_LOG_CHANNEL_ID,
    panelChannelId: process.env.TICKET_PANEL_CHANNEL_ID,
    // Questions shown per ticket type when the ticket opens
    questions: {
      'ban_appeal': [
        'What is your Minecraft in-game username (IGN)?',
        'Why were you banned?',
        'Why should your ban be lifted?',
        'How long have you been on the server?',
        'Do you agree to follow the rules from now on?',
      ],
      'bug_report': [
        'What bug did you encounter?',
        'What steps can we take to reproduce it?',
        'What device / client are you using?',
        'Can you provide screenshots or video?',
      ],
      'player_report': [
        'Who are you reporting? (username)',
        'What rule did they break?',
        'When did this happen?',
        'Do you have any evidence?',
      ],
      'staff_report': [
        'Which staff member are you reporting?',
        'What did they do?',
        'When did this happen?',
        'Do you have evidence?',
      ],
      'general_support': [
        'How can we help you?',
        'Have you checked the FAQ / help channel?',
      ],
      'purchase_support': [
        'What did you purchase?',
        'What is your transaction ID?',
        'What issue are you having?',
      ],
      'partnership_request': [
        'What is your server / brand name?',
        'How many members do you have?',
        'What type of partnership are you looking for?',
        'Why should we partner with you?',
      ],
      'discord_report': [
        'What is the issue with Discord?',
        'Which channel / user is involved?',
        'What action would you like us to take?',
      ],
      'whitelist_application': [
        'What is your Minecraft username?',
        'How old are you?',
        'Why do you want to be whitelisted?',
        'Do you agree to the server rules?',
      ],
      'other': [
        'What is your request about?',
        'Please provide as much detail as possible.',
      ],
    },
  },

  // ─── Moderation ────────────────────────────────────────
  moderation: {
    logChannelId: process.env.MOD_LOG_CHANNEL_ID,
    muteRoleId: process.env.MUTE_ROLE_ID,
  },

  // ─── Logging Channels ──────────────────────────────────
  logging: {
    messageLogChannelId: process.env.MESSAGE_LOG_CHANNEL_ID,
    memberLogChannelId: process.env.MEMBER_LOG_CHANNEL_ID,
    voiceLogChannelId: process.env.VOICE_LOG_CHANNEL_ID,
    channelLogChannelId: process.env.CHANNEL_LOG_CHANNEL_ID,
  },

  // ─── Welcome System ────────────────────────────────────
  welcome: {
    channelId: process.env.WELCOME_CHANNEL_ID,
    leaveChannelId: process.env.LEAVE_CHANNEL_ID,
    autoRoleId: process.env.AUTO_ROLE_ID,
    verifiedRoleId: process.env.VERIFIED_ROLE_ID,
    verificationEnabled: process.env.VERIFICATION_ENABLED === 'true',
  },

  // ─── Suggestions ───────────────────────────────────────
  suggestions: {
    channelId: process.env.SUGGESTION_CHANNEL_ID,
    staffRoleId: process.env.SUGGESTION_STAFF_ROLE_ID,
  },

  // ─── Polls ─────────────────────────────────────────────
  polls: {
    channelId: process.env.POLL_CHANNEL_ID,
  },

  // ─── Giveaways ─────────────────────────────────────────
  giveaways: {
    staffRoleId: process.env.GIVEAWAY_STAFF_ROLE_ID,
  },

  // ─── Auto Moderation ───────────────────────────────────
  autoMod: {
    antiSpam: {
      enabled: process.env.ANTI_SPAM_ENABLED === 'true',
      maxMessages: parseInt(process.env.ANTI_SPAM_MAX_MESSAGES, 10) || 5,
      intervalMs: parseInt(process.env.ANTI_SPAM_INTERVAL_MS, 10) || 5000,
    },
    antiScam: {
      enabled: process.env.ANTI_SCAM_ENABLED === 'true',
    },
    antiMassMention: {
      enabled: process.env.ANTI_MASS_MENTION_ENABLED === 'true',
      limit: parseInt(process.env.ANTI_MASS_MENTION_LIMIT, 10) || 5,
    },
    badWordFilter: {
      enabled: process.env.BAD_WORD_FILTER_ENABLED === 'true',
      words: [
        'badword1', 'badword2',
      ],
    },
    antiInvite: {
      enabled: process.env.ANTI_INVITE_ENABLED === 'true',
    },
    antiRaid: {
      enabled: process.env.ANTI_RAID_ENABLED === 'true',
      joinThreshold: parseInt(process.env.ANTI_RAID_JOIN_THRESHOLD, 10) || 10,
      timeWindowMs: parseInt(process.env.ANTI_RAID_TIME_WINDOW_MS, 10) || 10000,
    },
  },

  // ─── Embed Styling ─────────────────────────────────────
  embed: {
    color: {
      primary: parseInt(process.env.EMBED_COLOR_PRIMARY?.replace('#', ''), 16) || 0x5865F2,
      success: parseInt(process.env.EMBED_COLOR_SUCCESS?.replace('#', ''), 16) || 0x57F287,
      error: parseInt(process.env.EMBED_COLOR_ERROR?.replace('#', ''), 16) || 0xED4245,
      warning: parseInt(process.env.EMBED_COLOR_WARNING?.replace('#', ''), 16) || 0xFEE75C,
    },
    footer: {
      text: process.env.EMBED_FOOTER_TEXT || 'CloudFFA Bot',
      iconURL: process.env.EMBED_FOOTER_ICON || undefined,
    },
  },

  // ─── Emojis ────────────────────────────────────────────
  emoji: {
    success: process.env.EMOJI_SUCCESS || '✅',
    error: process.env.EMOJI_ERROR || '❌',
    warning: process.env.EMOJI_WARNING || '⚠️',
    ticket: process.env.EMOJI_TICKET || '🎫',
    mod: process.env.EMOJI_MOD || '🛡️',
    log: process.env.EMOJI_LOG || '📝',
    welcome: process.env.EMOJI_WELCOME || '👋',
    leave: process.env.EMOJI_LEAVE || '👋',
    suggestion: process.env.EMOJI_SUGGESTION || '💡',
    poll: process.env.EMOJI_POLL || '📊',
    giveaway: process.env.EMOJI_GIVEAWAY || '🎉',
  },

  // ─── Anticheat (MySQL) ─────────────────────────────────
  anticheat: {
    banChannelId: process.env.ANTICHEAT_BAN_CHANNEL_ID,
  },

  // ─── Database ──────────────────────────────────────────
  database: {
    path: process.env.DATABASE_PATH || './database.sqlite',
  },
};

module.exports = config;
