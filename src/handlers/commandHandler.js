const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

/**
 * Recursively walks through the commands directory,
 * loading every .js file as a command into the client.commands Collection.
 */
async function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', 'commands');

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const command = require(fullPath);
        if ('data' in command && 'execute' in command) {
          client.commands.set(command.data.name, command);
        } else {
          logger.warn(`Command at ${fullPath} is missing required "data" or "execute" property.`);
        }
      }
    }
  }

  walk(commandsPath);
}

/**
 * Registers all slash commands globally or to a specific guild.
 * Used by the deploy script.
 */
async function deployCommands(client) {
  const commands = [];
  const commandsPath = path.join(__dirname, '..', 'commands');

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const command = require(fullPath);
        if ('data' in command) {
          commands.push(command.data.toJSON());
        }
      }
    }
  }

  walk(commandsPath);

  if (process.env.GUILD_ID) {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (guild) {
      await guild.commands.set(commands);
      logger.info(`Deployed ${commands.length} commands to guild ${process.env.GUILD_ID}.`);
    } else {
      logger.error(`Guild ${process.env.GUILD_ID} not found.`);
    }
  } else {
    await client.application.commands.set(commands);
    logger.info(`Deployed ${commands.length} commands globally.`);
  }
}

module.exports = { loadCommands, deployCommands };
