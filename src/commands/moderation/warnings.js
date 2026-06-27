const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, createEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');
const { getDb } = require('../../database/database');
const { formatDate } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check warnings for a user.')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to check warnings for.').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ModerateMembers'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Moderate Members** permission.')], ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const { all } = getDb();

    const warnings = all(
      'SELECT * FROM warnings WHERE user_id = ? AND guild_id = ? ORDER BY timestamp DESC',
      [user.id, interaction.guild.id]
    );

    if (warnings.length === 0) {
      return interaction.reply({
        embeds: [createEmbed({
          title: 'Warnings',
          description: `**${user.tag}** has no warnings.`,
          color: require('../../config/client').embed.color.success,
        })],
      });
    }

    const fields = warnings.map((w, i) => ({
      name: `Warning #${i + 1}`,
      value: `**Moderator:** <@${w.moderator_id}>\n**Reason:** ${w.reason}\n**Date:** ${formatDate(w.timestamp)}`,
      inline: false,
    }));

    const embed = createEmbed({
      title: `Warnings for ${user.tag}`,
      description: `Total: **${warnings.length}** warning(s)`,
      fields,
      color: require('../../config/client').embed.color.warning,
      timestamp: new Date(),
    });

    await interaction.reply({ embeds: [embed] });
  },
};
