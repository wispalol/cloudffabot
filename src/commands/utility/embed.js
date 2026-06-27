const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send a custom embed to a channel.')
    .addStringOption((option) =>
      option.setName('title')
        .setDescription('Embed title.')
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option.setName('description')
        .setDescription('Embed description.')
        .setRequired(true)
        .setMaxLength(4000)
    )
    .addChannelOption((option) =>
      option.setName('channel')
        .setDescription('Channel to send the embed to.')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('color')
        .setDescription('Hex color code (e.g. #5865F2).')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ManageMessages'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Manage Messages** permission.')], ephemeral: true });
    }

    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const color = interaction.options.getString('color') || null;

    const embed = createEmbed({
      title,
      description,
      color: color ? parseInt(color.replace('#', ''), 16) : undefined,
      timestamp: new Date(),
    });

    await channel.send({ embeds: [embed] });

    await interaction.reply({
      embeds: [successEmbed(`Embed sent to ${channel}.`)],
      ephemeral: true,
    });
  },
};
