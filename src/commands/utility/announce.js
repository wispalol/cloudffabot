const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send an announcement to a channel.')
    .addStringOption((option) =>
      option.setName('message')
        .setDescription('The announcement message.')
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addChannelOption((option) =>
      option.setName('channel')
        .setDescription('Channel to send the announcement to.')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('title')
        .setDescription('Optional embed title.')
        .setRequired(false)
        .setMaxLength(256)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ManageMessages'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Manage Messages** permission.')], ephemeral: true });
    }

    const message = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const title = interaction.options.getString('title') || '📢 Announcement';

    const embed = createEmbed({
      title,
      description: message,
      color: config.embed.color.primary,
      author: {
        name: interaction.guild.name,
        iconURL: interaction.guild.iconURL(),
      },
      timestamp: new Date(),
    });

    await channel.send({ content: '@everyone', embeds: [embed] });

    await interaction.reply({
      embeds: [successEmbed(`Announcement sent to ${channel}.`)],
      ephemeral: true,
    });
  },
};
