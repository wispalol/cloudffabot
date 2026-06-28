require('dotenv').config();

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const logger = require('./src/config/logger');
const { connectDatabase, getDb } = require('./src/database/database');
const { loadCommands } = require('./src/handlers/commandHandler');
const { loadEvents } = require('./src/handlers/eventHandler');
const i18n = require('./src/i18n');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
});

client.commands = new Collection();
client.cooldowns = new Collection();

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

async function start() {
  try {
    await connectDatabase();
    i18n.init(getDb);
    logger.info('Database connected successfully.');

    await loadCommands(client);
    logger.info(`Loaded ${client.commands.size} commands.`);

    await loadEvents(client);
    logger.info('Events loaded.');

    await client.login(process.env.TOKEN);
    logger.info('Bot logged in successfully.');
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

start();

module.exports = client;
