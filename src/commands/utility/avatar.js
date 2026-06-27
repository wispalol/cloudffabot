const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Get a user\'s avatar.')
    .addUserOption((option) =>
      option.setName('user')
        .setDescription('The user to get the avatar of.')
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;

    const embed = createEmbed({
      title: `${user.tag}'s Avatar`,
      image: user.displayAvatarURL({ size: 1024, extension: 'png' }),
      url: user.displayAvatarURL({ size: 1024, extension: 'png' }),
      color: require('../../config/client').embed.color.primary,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
