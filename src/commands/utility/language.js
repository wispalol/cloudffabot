const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const i18n = require('../../i18n');
const { createEmbed } = require('../../utils/embeds');
const config = require('../../config/client');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Change your language preference.'),

  async execute(interaction) {
    const locales = i18n.getLocaleInfo();
    const current = i18n.getUserLocale(interaction.user.id);
    const currentName = locales.find(l => l.code === current);

    const select = new StringSelectMenuBuilder()
      .setCustomId('language_select')
      .setPlaceholder(currentName ? `${currentName.flag} ${currentName.name}` : 'English')
      .addOptions(
        locales.map(l => ({
          label: `${l.flag} ${l.name}`,
          value: l.code,
          ...(l.code === current ? { description: 'Currently selected' } : {}),
        }))
      );

    await interaction.reply({
      embeds: [createEmbed({
        title: '🌐 Language Settings',
        description: 'Select your preferred language from the dropdown below.',
        color: config.embed.color.primary,
      })],
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  },
};
