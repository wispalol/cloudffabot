const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const { formatDate } = require('../../utils/helpers');
const { hasPermissions } = require('../../utils/permissions');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Display information about this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ModerateMembers'])) {
      return interaction.reply({ embeds: [require('../../utils/embeds').errorEmbed('You need **Moderate Members** permission.')], ephemeral: true });
    }

    await interaction.deferReply();

    const guild = interaction.guild;
    await guild.fetch();

    const channels = guild.channels.cache;
    const textChannels = channels.filter((c) => c.type === 0).size;
    const voiceChannels = channels.filter((c) => c.type === 2).size;
    const categories = channels.filter((c) => c.type === 4).size;

    const members = await guild.members.fetch();
    const bots = members.filter((m) => m.user.bot).size;
    const humans = members.size - bots;

    const boosts = guild.premiumSubscriptionCount || 0;

    const embed = createEmbed({
      title: guild.name,
      thumbnail: guild.iconURL({ size: 256 }),
      color: config.embed.color.primary,
      fields: [
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
        { name: 'Created', value: formatDate(guild.createdAt), inline: true },
        { name: 'Members', value: `Total: **${members.size}**\nHumans: **${humans}**\nBots: **${bots}**`, inline: true },
        { name: 'Channels', value: `Text: **${textChannels}**\nVoice: **${voiceChannels}**\nCategories: **${categories}**`, inline: true },
        { name: 'Boosts', value: `**${boosts}** (Level ${guild.premiumTier})`, inline: true },
        { name: 'Roles', value: `**${guild.roles.cache.size}**`, inline: true },
        { name: 'Emojis', value: `**${guild.emojis.cache.size}**`, inline: true },
        { name: 'Verification Level', value: `${guild.verificationLevel}`, inline: true },
      ],
      timestamp: new Date(),
    });

    await interaction.editReply({ embeds: [embed] });
  },
};
