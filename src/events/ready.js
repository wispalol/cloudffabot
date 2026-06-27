const logger = require('../config/logger');
const config = require('../config/client');
const { sendTicketPanel } = require('../tickets/ticketManager');

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    logger.info(`${client.user.tag} is online and ready!`);

    // Set bot activity
    client.user.setPresence({
      activities: [{
        name: `over ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)} members`,
        type: 3,
      }],
      status: 'online',
    });

    // Update activity every 30 minutes
    setInterval(() => {
      const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
      client.user.setActivity(`over ${totalMembers} members`, { type: 3 });
    }, 30 * 60 * 1000);

    // Auto-deploy ticket panel
    await deployTicketPanel(client);
  },
};

async function deployTicketPanel(client) {
  const channelId = config.ticket.panelChannelId;
  if (!channelId) {
    logger.info('No TICKET_PANEL_CHANNEL_ID set — skipping auto panel.');
    return;
  }

  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    logger.warn(`Ticket panel channel ${channelId} not found.`);
    return;
  }

  try {
    // Delete previous panel messages from this bot
    const messages = await channel.messages.fetch({ limit: 20 });
    const oldPanels = messages.filter(m => m.author.id === client.user.id);
    if (oldPanels.size > 0) {
      await channel.bulkDelete(oldPanels);
    }

    await sendTicketPanel(channel);
    logger.info(`Ticket panel deployed to #${channel.name}.`);
  } catch (error) {
    logger.error('Failed to deploy ticket panel:', error);
  }
}
