const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { hasPermissions } = require('../../utils/permissions');
const { getDb } = require('../../database/database');
const { logModAction } = require('../../moderation/autoMod');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member.')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to warn.').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for the warning.').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    if (!hasPermissions(interaction.member, ['ModerateMembers'])) {
      return interaction.reply({ embeds: [errorEmbed('You need **Moderate Members** permission.')], ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const { run } = getDb();
    run(
      'INSERT INTO warnings (user_id, guild_id, moderator_id, reason) VALUES (?, ?, ?, ?)',
      [user.id, interaction.guild.id, interaction.user.id, reason]
    );

    const embed = successEmbed(`**${user.tag}** has been warned.\n**Reason:** ${reason}`);
    await interaction.reply({ embeds: [embed] });

    await logModAction(interaction.guild, {
      action: 'Warn',
      user,
      moderator: interaction.user,
      reason,
    });

    // DM the user about the warning
    try {
      await user.send({
        embeds: [
          require('../../utils/embeds').createEmbed({
            title: '⚠️ You have been warned',
            description: `**Server:** ${interaction.guild.name}\n**Reason:** ${reason}`,
            color: require('../../config/client').embed.color.warning,
          }),
        ],
      });
    } catch {
      // Cannot DM user — ignore
    }
  },
};
