const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverstats')
    .setDescription('Display detailed server statistics.'),

  async execute(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;
    await guild.fetch();

    const channels = guild.channels.cache;
    const textChannels = channels.filter((c) => c.type === 0).size;
    const voiceChannels = channels.filter((c) => c.type === 2).size;
    const forumChannels = channels.filter((c) => c.type === 15).size;
    const categories = channels.filter((c) => c.type === 4).size;

    const members = await guild.members.fetch();
    const bots = members.filter((m) => m.user.bot).size;
    const humans = members.size - bots;
    const online = members.filter((m) => m.presence?.status === 'online').size;

    const boosts = guild.premiumSubscriptionCount || 0;

    const embed = createEmbed({
      title: `${guild.name} — Statistics`,
      thumbnail: guild.iconURL({ size: 256 }),
      color: config.embed.color.primary,
      fields: [
        { name: '👥 Members', value: `**${members.size}** total\n👤 ${humans} humans\n🤖 ${bots} bots\n🟢 ${online} online`, inline: true },
        { name: '💬 Channels', value: `**${channels.size}** total\n📝 ${textChannels} text\n🔊 ${voiceChannels} voice\n📂 ${forumChannels} forum\n📁 ${categories} categories`, inline: true },
        { name: '✨ Server Info', value: `💎 **${boosts}** boosts (Level ${guild.premiumTier})\n🏷️ **${guild.roles.cache.size}** roles\n😀 **${guild.emojis.cache.size}** emojis`, inline: true },
        { name: '📅 Created', value: `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:F>`, inline: true },
        { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: true },
      ],
      timestamp: new Date(),
    });

    await interaction.editReply({ embeds: [embed] });
  },
};
