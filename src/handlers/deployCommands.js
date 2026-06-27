/**
 * Run this file once (or whenever commands change) to register
 * all slash commands with Discord.
 *
 * Usage: npm run deploy
 */

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const logger = require('../config/logger');
const { deployCommands } = require('./commandHandler');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  logger.info(`Logged in as ${client.user.tag}, deploying commands...`);
  await deployCommands(client);
  logger.info('Command deployment complete. Disconnecting.');
  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN).catch((err) => {
  logger.error('Failed to login:', err);
  process.exit(1);
});
