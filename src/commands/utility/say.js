const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something in a channel.')
    .addStringOption((option) =>
      option.setName('message')
        .setDescription('The message to send.')
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addChannelOption((option) =>
      option.setName('channel')
        .setDescription('Channel to send the message to.')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ManageMessages'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Manage Messages** permission.')], ephemeral: true });
    }

    const message = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    await channel.send(message);

    await interaction.reply({
      embeds: [successEmbed(`Message sent to ${channel}.`)],
      ephemeral: true,
    });
  },
};
