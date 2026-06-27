const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Show the current member count.'),

  async execute(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    const members = await guild.members.fetch();
    const bots = members.filter((m) => m.user.bot).size;
    const humans = members.size - bots;
    const online = members.filter((m) => m.presence?.status === 'online').size;

    const embed = createEmbed({
      title: `${config.emoji.welcome} Member Count`,
      description: `**${guild.name}**`,
      color: config.embed.color.primary,
      fields: [
        { name: 'Total', value: `**${members.size}**`, inline: true },
        { name: 'Humans', value: `**${humans}**`, inline: true },
        { name: 'Bots', value: `**${bots}**`, inline: true },
        { name: 'Online', value: `**${online}**`, inline: true },
      ],
      thumbnail: guild.iconURL({ size: 128 }),
      timestamp: new Date(),
    });

    await interaction.editReply({ embeds: [embed] });
  },
};
