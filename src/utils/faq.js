const config = require('../config/client');
const logger = require('../config/logger');

const FAQ_ENTRIES = [
  {
    keywords: ['how to join', 'join server', 'server ip', 'ip address', 'how do i join', 'minecraft server', 'server address'],
    category: 'Server Info',
    answer: 'You can join our Minecraft server using the IP address found in the **#server-info** channel. Make sure you\'re on the latest supported version listed there.',
  },
  {
    keywords: ['rules', 'rule', 'what are the rules', 'server rules', 'guidelines'],
    category: 'Rules',
    answer: 'Our server rules are posted in the **#rules** channel. Please read them carefully — breaking rules may result in warnings, mutes, or bans.',
  },
  {
    keywords: ['rank', 'ranks', 'donate', 'donation', 'purchase rank', 'buy rank', 'store', 'shop', 'how to donate', 'perks'],
    category: 'Ranks & Donations',
    answer: 'You can view available ranks and purchase them at our store. Check **#store** or **#rank-info** for the link and details on perks.',
  },
  {
    keywords: ['how do i report', 'report player', 'player report', 'report a player', 'report someone'],
    category: 'Reporting',
    answer: 'To report a player, open a **Player Report** ticket by clicking the button in **#tickets**. Please provide their username, the rule they broke, and any evidence you have.',
  },
  {
    keywords: ['appeal', 'ban appeal', 'unban', 'how to appeal', 'appeal ban', 'banned'],
    category: 'Ban Appeals',
    answer: 'If you\'ve been banned and want to appeal, open a **Ban Appeal** ticket in **#tickets**. Be honest about your situation — our team will review it promptly.',
  },
  {
    keywords: ['discord', 'discord server', 'invite', 'discord link'],
    category: 'Discord',
    answer: 'You\'re already here! Share our Discord with friends using the invite link in **#information**.',
  },
  {
    keywords: ['password', 'reset password', 'forgot password', 'login', 'account'],
    category: 'Account Help',
    answer: 'For account-related issues like forgotten passwords or login problems, please open a **General Support** ticket and our team will assist you.',
  },
  {
    keywords: ['bug', 'glitch', 'error', 'issue', 'problem', 'not working', 'broken'],
    category: 'Bug Reports',
    answer: 'Found a bug? Please open a **Bug Report** ticket with steps to reproduce it, what device you\'re using, and any screenshots or videos if possible.',
  },
  {
    keywords: ['how to get', 'how do i get', 'how can i', 'tutorial', 'guide', 'how do you'],
    category: 'General Help',
    answer: 'I\'ll search for an answer to help you out! One moment please...',
    triggerSearch: true,
  },
  {
    keywords: ['staff', 'apply for staff', 'staff application', 'how to become staff', 'moderator apply', 'helper apply', 'staff team'],
    category: 'Staff Applications',
    answer: 'Staff applications open periodically. Keep an eye on **#announcements** for when applications are available. Make sure you meet the requirements listed in the post.',
  },
  {
    keywords: ['giveaway', 'giveaways', 'how to enter giveaway', 'prize'],
    category: 'Giveaways',
    answer: 'Giveaways are held regularly! Watch for giveaway announcements and click the enter button to participate. Winners are chosen randomly at the end.',
  },
  {
    keywords: ['suggestion', 'suggest', 'idea', 'feature request', 'how to suggest'],
    category: 'Suggestions',
    answer: 'Have a suggestion? Use the `/suggest` command to submit it! The community can vote, and staff will review it.',
  },
  {
    keywords: ['poll', 'vote', 'voting', 'how to vote'],
    category: 'Polls',
    answer: 'Polls are created by staff for community input. Just click the buttons to cast your vote!',
  },
  {
    keywords: ['mute', 'muted', 'why am i muted', 'timeout', 'timed out', 'silenced'],
    category: 'Moderation',
    answer: 'If you\'ve been muted or timed out, you may have broken a server rule. Check **#rules** and wait for the duration to expire. If you believe this was a mistake, open a **General Support** ticket.',
  },
  {
    keywords: ['chat', 'chat rules', 'where to chat', 'channels', 'text channels', 'voice channels'],
    category: 'Chat',
    answer: 'You can chat in the appropriate channels — **#general** for general discussion, **#media** for screenshots/videos, and **#voice-chat** for voice conversations.',
  },
  {
    keywords: ['bot', 'bot commands', 'commands', 'command list', 'what can the bot do', 'bot help', 'help'],
    category: 'Bot Help',
    answer: 'I have many commands! Use `/` to see all available commands. Popular ones include `/ping`, `/search`, `/suggest`, `/poll`, `/serverstats`, and `/language`. For questions, just ask me directly!',
    triggerSearch: false,
  },
  {
    keywords: ['language', 'change language', 'spanish', 'polish', 'español', 'polski', 'english'],
    category: 'Language',
    answer: 'You can change your language using the `/language` command. I currently support English, Spanish, and Polish.',
  },
  {
    keywords: ['whitelist', 'whitelisted', 'whitelist apply', 'how to get whitelisted'],
    category: 'Whitelist',
    answer: 'To apply for whitelist, open a **Whitelist Application** ticket in **#tickets**. Make sure to include your Minecraft username and answer all questions honestly.',
  },
  {
    keywords: ['partnership', 'partner', 'partner with us', 'partnership request', 'affiliate'],
    category: 'Partnerships',
    answer: 'Interested in partnering with us? Open a **Partnership Request** ticket in **#tickets** and tell us about your server or brand.',
  },
  {
    keywords: ['purchase', 'buy', 'transaction', 'payment', 'refund', 'purchase support'],
    category: 'Purchase Support',
    answer: 'For purchase-related issues, please open a **Purchase Support** ticket with your transaction ID and a description of the issue. Our team will help sort it out.',
  },
];

function findFaqEntry(query) {
  const lower = query.toLowerCase().trim();

  for (const entry of FAQ_ENTRIES) {
    for (const keyword of entry.keywords) {
      if (lower.includes(keyword)) {
        return entry;
      }
    }
  }

  for (const entry of FAQ_ENTRIES) {
    const words = lower.split(/\s+/);
    const matches = entry.keywords.filter(kw => lower.includes(kw)).length;
    if (matches > 0) return entry;
  }

  return null;
}

function getAllCategories() {
  const cats = new Map();
  for (const entry of FAQ_ENTRIES) {
    if (!cats.has(entry.category)) {
      cats.set(entry.category, []);
    }
    cats.get(entry.category).push({
      keywords: entry.keywords,
      answer: entry.answer,
      triggerSearch: entry.triggerSearch,
    });
  }
  return cats;
}

function formatFaqList() {
  const cats = getAllCategories();
  const lines = [];
  for (const [category, entries] of cats) {
    lines.push(`**${category}**`);
    for (const entry of entries) {
      lines.push(`- \`${entry.keywords.slice(0, 3).join(', ')}\``);
    }
  }
  return lines.join('\n');
}

module.exports = {
  findFaqEntry,
  getAllCategories,
  formatFaqList,
  FAQ_ENTRIES,
};
