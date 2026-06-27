const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatDate } = require('../../utils/helpers');
const { hasPermissions } = require('../../utils/permissions');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get information about a user.')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to get info about.').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ModerateMembers'])) {
      return interaction.reply({ embeds: [require('../../utils/embeds').errorEmbed('You need **Moderate Members** permission.')], ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const roles = member
      ? member.roles.cache
          .filter((r) => r.id !== interaction.guild.id)
          .sort((a, b) => b.position - a.position)
          .map((r) => r.toString())
          .join(', ') || 'None'
      : 'Not in server';

    const embed = createEmbed({
      title: `${user.tag}`,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      color: config.embed.color.primary,
      fields: [
        { name: 'User ID', value: `\`${user.id}\``, inline: true },
        { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
        { name: 'Created', value: formatDate(user.createdAt), inline: true },
        ...(member
          ? [
              { name: 'Joined Server', value: formatDate(member.joinedAt), inline: true },
              { name: 'Nickname', value: member.nickname || 'None', inline: true },
              { name: 'Highest Role', value: member.roles.highest.toString(), inline: true },
            ]
          : [{ name: 'Status', value: 'Not in server', inline: true }]),
        { name: `Roles [${member ? member.roles.cache.size - 1 : 0}]`, value: roles, inline: false },
      ],
      timestamp: new Date(),
    });

    await interaction.reply({ embeds: [embed] });
  },
};
