// Only allow Minecraft-related or general support (payments, etc.) queries
// Block everything unsafe for children

const { EmbedBuilder } = require('discord.js');
const config = require('../config/client');
const logger = require('../config/logger');

const BLOCKED_KEYWORDS = [
  // Adult / NSFW
  'porn', 'sex', 'nude', 'naked', 'xxx', 'nsfw', 'adult', 'hentai',
  'onlyfans', 'escort', 'hookup', 'dating', 'milf', 'boob', 'tits',
  'dick', 'cock', 'pussy', 'asshole', 'blowjob', 'stripper', 'strip club',
  'prostitut', 'cam girl', 'erotic', 'fetish', 'bdsm', 'kink',
  'slut', 'whore', 'bitch', 'cum', 'semen', 'orgasm',
  'sexual', 'seduct', 'lingerie', 'vibrator', 'dildo',
  'pornhub', 'xvideos', 'xhamster', 'redtube', 'only fans',
  'nude mod', 'naked skin', 'sex mod', 'adult mod',
  'e621', 'rule34', 'r34',

  // Violence / Gore
  'gore', 'beheading', 'decapitat', 'torture', 'murder', 'kill yourself',
  'suicide', 'self harm', 'self-harm', 'cutting', 'blood', 'snuff',
  'mass shooting', 'school shooting', 'terrorist', 'bomb making',
  'how to kill', 'how to hurt', 'weapon mod',

  // Hate / Slurs
  'nigger', 'faggot', 'retard', 'chink', 'spic', 'kike',
  'gook', 'tranny', 'dyke', 'mongoloid',
  'white supremac', 'nazi', 'kkk', 'race war',
  'heil hitler', '1488', '14 words',

  // Drugs / Alcohol (for minors)
  'how to smoke', 'how to vape', 'buy weed', 'buy cocaine',
  'buy meth', 'buy heroin', 'drug dealer', 'drugs near me',
  'marijuana shop', 'cannabis shop', 'how to roll a blunt',
  'how to take a hit', 'lean drink', 'codeine', 'xanax',
  'adderall buy', 'lsd buy', 'mdma buy', 'ecstasy',
  'how to get high', 'vape juice', 'nicotine',

  // Hacking / Malware (non-Minecraft)
  'hack facebook', 'hack instagram', 'hack discord', 'hack snapchat',
  'hack password', 'how to hack someone', 'crack software',
  'keylogger', 'ransomware', 'trojan', 'virus maker',
  'ddos tool', 'ddos download', 'booter', 'stresser',
  'credit card generator', 'credit card numbers',
  'social security number', 'ssn lookup',
  'fake id', 'fake passport', 'fake driver license',
  'how to scam', 'phishing page', 'phishing template',

  // Minecraft Cheat Clients (not child-safe)
  'meteor client', 'meteor hack', 'meteor',
  'metor', 'metore', 'meteore', 'meteor clinet', 'metore client', 'metor client', 'metore clinet', 'metor clinet',
  'wurst client', 'wurst hack',
  'liquidbounce', 'liquid bounce',
  'impact client',
  'aristois',
  'future client',
  'rusherhack', 'rusher hack',
  'kami blue', 'kami client',
  'bleachhack',
  'inertia client',
  'thunderhack', 'thunder hack',
  'lambda client',
  'pyro client',
  'phobos client',
  'gamesense',
  'catalyst client',
  'sigma client',
  'flux client',
  'tenacity client',
  'rise client',
  'novoline',
  'moon client',
  'slinky client',
  'nightx', 'night x',
  'polar client',
  'opal client',
  'celestial client',
  'ares client',
  'boze',
  'vape v4', 'vape client',
  'dortware',
  'bongware',
  'crystal client',
  'opcional',

  // General Cheating / Hacking (not child-safe)
  'how to hack', 'how to cheat', 'how to use hacks', 'how to use cheats',
  'hack client', 'cheat client', 'hacked client', 'cheating client',
  'best hack', 'best cheat', 'best client',

  // Gambling
  'online casino', 'betting site', 'sports bet', 'poker real money',
  'roulette strategy', 'blackjack strategy', 'slot machine',
  'gambling site', 'real money casino',
];

const ALLOWED_CATEGORIES = {
  minecraft: [
    'minecraft', 'mc', 'server', 'ip', 'join', 'connect',
    'gameplay', 'mod', 'plugin', 'resource pack', 'texture pack',
    'shader', 'skin', 'cape', 'version',
    'crafting', 'recipe', 'enchant', 'build', 'redstone',
    'command', 'command block', 'seed', 'world', 'biome',
    'mob', 'ender dragon', 'wither', 'nether', 'end',
    'survival', 'creative', 'hardcore', 'multiplayer',
    'whitelist', 'blacklist', 'ban', 'report', 'appeal',
    'rank', 'donation', 'store', 'shop', 'buy', 'purchase',
    'pay', 'payment', 'price', 'cost', 'refund',
    'cracked', 'premium', 'auth', 'login', 'register',
    'lag', 'tps', 'performance', 'ping', 'connection',
    'cloudffa', 'cloud ff a', 'cloudffa', 'kit', 'map', 'arena',
    'ffa', 'practice', 'duel', 'pvp', 'combat',
    'cheat', 'hack', 'client', 'anticheat', 'killaura',
    'blockhit', 'w-tap', 's-tap', 'hit select', 'reach',
    'cps', 'autoclicker', 'drag click', 'jitter click',
    'gaming', 'game', 'discord', 'bot', 'setup',
    'setting', 'config', 'option', 'help', 'how to',
    'question', 'support', 'issue', 'problem', 'fix',
    'error', 'bug', 'glitch', 'crash', 'freeze',
    'install', 'download', 'update', 'tutorial',
    'staff', 'admin', 'moderator', 'helper', 'owner',
  ],
  general_support: [
    'payment', 'paypal', 'card', 'payment method',
    'refund', 'chargeback', 'dispute', 'transaction',
    'receipt', 'invoice', 'confirm', 'subscription',
    'billing', 'renew', 'cancel subscription',
    'discord', 'support', 'help', 'ticket',
    'issue', 'problem', 'error', 'bug', 'report',
    'how to', 'tutorial', 'guide', 'instruction',
    'question', 'inquiry', 'info', 'information',
    'account', 'login', 'password', 'reset',
    'recover', 'lost', 'access',
    'store', 'shop', 'purchase', 'buy', 'order',
    'product', 'item', 'key', 'code', 'redeem',
    'shipping', 'delivery', 'tracking',
    'where is my', 'when will', 'status',
    'contact', 'reach', 'speak', 'talk to',
    'server', 'discord server', 'guild',
    'rules', 'policy', 'terms', 'tos',
  ],
};

// For search queries: must be Minecraft-related or general support, and must not be blocked
function isQuerySafe(query) {
  const lower = query.toLowerCase().trim();
  if (!lower) return false;

  for (const kw of BLOCKED_KEYWORDS) {
    if (lower.includes(kw)) return false;
  }

  for (const [, keywords] of Object.entries(ALLOWED_CATEGORIES)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return true;
    }
  }

  return false;
}

// For ticket answers: only block if they contain explicitly bad content
function containsBlockedContent(text) {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;

  for (const kw of BLOCKED_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

function getBlockedMessage() {
  return {
    title: 'Content Safety Filter',
    description: 'This search was blocked by the **content safety filter**.\n\nPlease only ask about:\n• Minecraft server-related questions\n• General support topics (payments, purchases, account help, etc.)\n\nIf you need help with something appropriate, please rephrase your question.',
  };
}

function filterSearchResults(results) {
  if (!results || !Array.isArray(results)) return results;
  return results.filter(r => {
    const text = (r.title + ' ' + r.snippet + ' ' + (r.link || r.formattedUrl || '')).toLowerCase();
    for (const kw of BLOCKED_KEYWORDS) {
      if (text.includes(kw)) return false;
    }
    return true;
  });
}

async function logSafetyViolation(guild, userId, query, reason, source) {
  if (!guild) return;
  try {
    const logChannelId = config.moderation?.logChannelId;
    if (!logChannelId) return;
    const channel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🚨 Safety Filter Triggered')
      .setColor(0xED4245)
      .setDescription(`**User:** <@${userId}> (\`${userId}\`)\n**Query:** \`${query}\`\n**Source:** ${source || 'Unknown'}\n**Reason:** ${reason || 'Blocked content'}`)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('Failed to log safety violation:', err);
  }
}

module.exports = { isQuerySafe, containsBlockedContent, getBlockedMessage, filterSearchResults, logSafetyViolation };
