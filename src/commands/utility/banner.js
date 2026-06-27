const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Get a user\'s banner.')
    .addUserOption((option) =>
      option.setName('user')
        .setDescription('The user to get the banner of.')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const user = interaction.options.getUser('user') || interaction.user;
    const fetchedUser = await user.fetch();

    if (!fetchedUser.banner) {
      return interaction.reply({
        embeds: [errorEmbed('This user does not have a banner.')],
      });
    }

    const embed = createEmbed({
      title: `${user.tag}'s Banner`,
      image: fetchedUser.bannerURL({ size: 1024, extension: 'png' }),
      url: fetchedUser.bannerURL({ size: 1024, extension: 'png' }),
      color: require('../../config/client').embed.color.primary,
    });

    await interaction.editReply({ embeds: [embed] });
  },
};
