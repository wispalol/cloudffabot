const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

/**
 * Loads every .js file in the events directory and binds it to the client.
 * Files should export a `name` (event name) and an `execute` function.
 * Optionally export `once: true` for one-time listeners.
 */
async function loadEvents(client) {
  const eventsPath = path.join(__dirname, '..', 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }

    logger.debug(`Loaded event: ${event.name}`);
  }
}

module.exports = { loadEvents };
