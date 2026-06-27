const { EmbedBuilder } = require('discord.js');
const config = require('../config/client');

/**
 * Creates a basic embed with the primary color and footer applied.
 */
function createEmbed(data = {}) {
  const embed = new EmbedBuilder()
    .setColor(data.color ?? config.embed.color.primary)
    .setFooter({
      text: data.footerText ?? config.embed.footer.text,
      iconURL: data.footerIcon ?? config.embed.footer.iconURL,
    });

  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.url) embed.setURL(data.url);
  if (data.timestamp) embed.setTimestamp(data.timestamp);
  if (data.image) embed.setImage(data.image);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.author) embed.setAuthor(data.author);
  if (data.fields) embed.addFields(data.fields);

  return embed;
}

/**
 * Success embed (green).
 */
function successEmbed(description, title) {
  return createEmbed({
    color: config.embed.color.success,
    title: title || `${config.emoji.success} Success`,
    description,
  });
}

/**
 * Error embed (red).
 */
function errorEmbed(description, title) {
  return createEmbed({
    color: config.embed.color.error,
    title: title || `${config.emoji.error} Error`,
    description,
  });
}

/**
 * Warning embed (yellow).
 */
function warningEmbed(description, title) {
  return createEmbed({
    color: config.embed.color.warning,
    title: title || `${config.emoji.warning} Warning`,
    description,
  });
}

/**
 * Generic logging embed used for message/edit/voice/mod logs.
 */
function logEmbed(fields, options = {}) {
  return createEmbed({
    color: options.color ?? config.embed.color.primary,
    title: options.title,
    description: options.description,
    fields,
    timestamp: options.timestamp ?? new Date(),
    footerText: `${config.embed.footer.text} • ${new Date().toLocaleString()}`,
  });
}

module.exports = { createEmbed, successEmbed, errorEmbed, warningEmbed, logEmbed };
