const { SlashCommandBuilder } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embeds');
const { getDb } = require('../../database/database');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify yourself using the code sent via DM.')
    .addStringOption((option) =>
      option.setName('code')
        .setDescription('The verification code from your DM.')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!config.welcome.verificationEnabled) {
      return interaction.reply({
        embeds: [errorEmbed('Verification is not enabled on this server.')],
        ephemeral: true,
      });
    }

    const code = interaction.options.getString('code');
    const { get, run } = getDb();

    const verification = get(
      'SELECT * FROM verification WHERE user_id = ? AND guild_id = ?',
      [interaction.user.id, interaction.guild.id]
    );

    if (!verification) {
      return interaction.reply({
        embeds: [errorEmbed('No verification code found for you. Try rejoining the server.')],
        ephemeral: true,
      });
    }

    if (verification.verified) {
      return interaction.reply({
        embeds: [errorEmbed('You are already verified.')],
        ephemeral: true,
      });
    }

    if (verification.code !== code.toUpperCase()) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid verification code. Please check the code sent to your DMs.')],
        ephemeral: true,
      });
    }

    // Verify the user
    run('UPDATE verification SET verified = 1 WHERE user_id = ?', [interaction.user.id]);

    const verifiedRole = interaction.guild.roles.cache.get(config.welcome.verifiedRoleId);
    if (verifiedRole) {
      await interaction.member.roles.add(verifiedRole);
    }

    // Remove auto-role if it exists and is different from verified role
    if (config.welcome.autoRoleId && config.welcome.autoRoleId !== config.welcome.verifiedRoleId) {
      const autoRole = interaction.guild.roles.cache.get(config.welcome.autoRoleId);
      if (autoRole && interaction.member.roles.cache.has(autoRole.id)) {
        await interaction.member.roles.remove(autoRole);
      }
    }

    await interaction.reply({
      embeds: [successEmbed('You have been verified! Welcome to the server.')],
      ephemeral: true,
    });
  },
};
