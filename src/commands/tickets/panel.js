const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { sendTicketPanel } = require('../../tickets/ticketManager');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Send the ticket panel to a channel.')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel to send the panel to.')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild || await interaction.client.guilds.fetch(interaction.guildId).catch(() => null);
    if (!guild) {
      return interaction.editReply({ embeds: [errorEmbed('Could not find the server. Try re-inviting the bot.')] });
    }

    const member = interaction.member || await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ embeds: [errorEmbed('You need **Administrator** permission to use this command.')] });
    }

    const channelOption = interaction.options.getChannel('channel');
    if (!channelOption) {
      return interaction.editReply({ embeds: [errorEmbed('Channel not found.')] });
    }

    const targetChannel = await guild.channels.fetch(channelOption.id).catch(() => null);
    if (!targetChannel) {
      return interaction.editReply({ embeds: [errorEmbed('Could not fetch that channel. Make sure the bot can see it.')] });
    }

    await interaction.editReply({ embeds: [successEmbed(`Sending ticket panel to ${targetChannel}...`)] });

    try {
      await sendTicketPanel(targetChannel);
      await interaction.editReply({ embeds: [successEmbed(`Ticket panel sent to ${targetChannel}.`)] });
    } catch (error) {
      await interaction.editReply({ embeds: [errorEmbed('Failed to send ticket panel. Check bot permissions in that channel.')] });
    }
  },
};
