const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const config = require('../config/client');
const { createEmbed } = require('../utils/embeds');
const logger = require('../config/logger');
const i18n = require('../i18n');

const ANSWERS = new Map();
const HUMAN_KEYWORDS = ['human', 'staff', 'person', 'agent', 'real person', 'człowiek', 'personel', 'humano', 'persona real'];

async function startAutoResponse(channel, member, type, ticketId, userId = null) {
  const effectiveUserId = userId || member.id;
  const typeName = getTicketTypeName(type);
  const questions = i18n.getQuestions(type, effectiveUserId);

  await channel.send({
    embeds: [createEmbed({
      title: i18n.t('auto.welcome.title', effectiveUserId, { type: typeName }),
      description: i18n.t('auto.welcome.desc', effectiveUserId, { member }),
      color: config.embed.color.primary,
      fields: questions && questions.length > 0
        ? [
            {
              name: i18n.t('auto.welcome.field_questions', effectiveUserId),
              value: i18n.t('auto.welcome.field_questions_value', effectiveUserId, {
                count: questions.length,
                plural: questions.length > 1 ? 's' : '',
              }),
            },
            {
              name: i18n.t('auto.welcome.field_time', effectiveUserId),
              value: i18n.t('auto.welcome.field_time_value', effectiveUserId),
            },
          ]
        : [],
      footerText: i18n.t('auto.welcome.footer', effectiveUserId),
    })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_escalate_${ticketId}`)
          .setLabel(i18n.t('auto.button.speak_staff', effectiveUserId))
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🙋')
      ),
    ],
  });

  if (!questions || questions.length === 0) {
    await channel.send({
      embeds: [createEmbed({
        title: i18n.t('auto.no_questions.title', effectiveUserId),
        description: i18n.t('auto.no_questions.desc', effectiveUserId, { type: typeName }),
        color: config.embed.color.success,
      })],
      components: [buildEscalateButtons(ticketId, effectiveUserId)],
    });
    return;
  }

  await new Promise((r) => setTimeout(r, 1500));
  ANSWERS.set(ticketId, []);
  await askNextQuestion(channel, member, type, ticketId, questions, 0, effectiveUserId);
}

async function askNextQuestion(channel, member, type, ticketId, questions, index, userId) {
  if (index >= questions.length) {
    return finishAutoResponse(channel, member, type, ticketId, userId);
  }

  const question = questions[index];
  const qNum = index + 1;

  const fields = [];

  if (type === 'ban_appeal' && index === 0) {
    fields.push({
      name: i18n.t('auto.question.tip_ban', userId),
      value: i18n.t('auto.question.tip_ban_value', userId),
    });
  } else {
    fields.push({
      name: i18n.t('auto.question.instructions', userId),
      value: i18n.t('auto.question.instructions_value', userId),
    });
  }

  if (index > 0 && index % 2 === 0) {
    fields.push({
      name: '💪 Almost there',
      value: i18n.t('auto.response.followup_encourage', userId),
    });
  }

  await channel.send({
    embeds: [createEmbed({
      title: i18n.t('auto.question.title', userId, { num: qNum, total: questions.length }),
      description: i18n.t('auto.question.desc', userId, { question }),
      color: config.embed.color.warning,
      fields,
      footerText: i18n.t('auto.question.footer', userId, { num: qNum, total: questions.length }),
    })],
  });

  try {
    const collected = await channel.awaitMessages({
      filter: (m) => m.author.id === member.id && !m.author.bot,
      max: 1,
      time: 5 * 60 * 1000,
      errors: ['time'],
    });

    const answer = collected.first();
    const answerText = answer.content;

    // Check if user is asking for human staff
    if (HUMAN_KEYWORDS.some((kw) => answerText.toLowerCase().includes(kw))) {
      await channel.send({
        embeds: [createEmbed({
          title: '🙋 Transferring to Staff',
          description: 'I understand you\'d like to speak with a real person. I\'ll notify our staff team right away.\n\nYour answers so far have been saved and will be shared with them.',
          color: config.embed.color.warning,
        })],
      });

      const staffRoleId = config.ticket.staffRoleId;
      if (staffRoleId) {
        await channel.send({
          content: `<@&${staffRoleId}> — ${member} is requesting to speak with a human staff member.`,
        });
      }

      const answers = ANSWERS.get(ticketId) || [];
      answers.push({ question, answer: answerText });
      ANSWERS.set(ticketId, answers);
      return;
    }

    const answers = ANSWERS.get(ticketId) || [];
    answers.push({ question, answer: answerText });
    ANSWERS.set(ticketId, answers);

    // Enhanced contextual response based on their answer
    const response = await generateProfessionalResponse(answerText, type, question, index, answers, questions.length, userId);
    await channel.send({ embeds: [response] });

    // Send a follow-up encouragement message for longer conversations
    if (index > 1 && answerText.length > 50 && index % 2 === 1) {
      await new Promise((r) => setTimeout(r, 800));
      await channel.send({
        embeds: [createEmbed({
          title: '💬 Thank you for the details',
          description: i18n.t('auto.response.followup_positive', userId),
          color: config.embed.color.primary,
        })],
      });
    }

    // Check for evidence mentions
    const evidenceKeywords = ['evidence', 'screenshot', 'proof', 'dowód', 'screen', 'prueba', 'captura'];
    const hasEvidence = evidenceKeywords.some((kw) => answerText.toLowerCase().includes(kw));
    if (hasEvidence && (type === 'bug_report' || type === 'player_report')) {
      await new Promise((r) => setTimeout(r, 800));
      await channel.send({
        embeds: [createEmbed({
          title: '📎 Evidence Noted',
          description: i18n.t('auto.response.followup_evidence', userId),
          color: config.embed.color.success,
        })],
      });
    }

    // Ban appeal specific: check for ban ID
    if (type === 'ban_appeal') {
      const banId = extractBanId(answerText);
      if (banId) {
        await channel.send({
          embeds: [createEmbed({
            title: i18n.t('auto.ban.checking_title', userId),
            description: i18n.t('auto.ban.checking_desc', userId, { banId }),
            color: config.embed.color.primary,
          })],
        });

        const banInfo = await lookupBan(channel.guild, banId);
        if (banInfo) {
          await channel.send({
            embeds: [createEmbed({
              title: i18n.t('auto.ban.found_title', userId),
              description: i18n.t('auto.ban.found_desc', userId, {
                tag: banInfo.user.tag,
                id: banInfo.user.id,
                reason: banInfo.reason || 'No reason recorded',
              }),
              color: config.embed.color.success,
              footerText: i18n.t('auto.ban.found_footer', userId),
            })],
          });
        } else {
          await channel.send({
            embeds: [createEmbed({
              title: i18n.t('auto.ban.not_found_title', userId),
              description: i18n.t('auto.ban.not_found_desc', userId, { banId }),
              color: config.embed.color.error,
            })],
          });
        }
      }

      const denialPhrases = ['didn\'t do', 'did not do', 'innocent', 'false ban', 'unfair', 'did nothing', 'wrongful', 'mistake', 'nie zrobiłem', 'niesłuszny', 'fałszywy', 'inocente', 'injusto'];
      const isDenial = denialPhrases.some((p) => answerText.toLowerCase().includes(p));
      if (isDenial && index < questions.length - 1) {
        await channel.send({
          embeds: [createEmbed({
            title: i18n.t('auto.ban.denial_title', userId),
            description: i18n.t('auto.ban.denial_desc', userId),
            color: config.embed.color.primary,
            footerText: i18n.t('auto.ban.denial_footer', userId),
          })],
        });
      }
    }

    // Brief pause then next question
    await new Promise((r) => setTimeout(r, 1000));
    await askNextQuestion(channel, member, type, ticketId, questions, index + 1, userId);
  } catch {
    await channel.send({
      embeds: [createEmbed({
        title: i18n.t('auto.question.time_expired_title', userId),
        description: i18n.t('auto.question.time_expired_desc', userId),
        color: config.embed.color.warning,
      })],
      components: [buildEscalateButtons(ticketId, userId)],
    });
  }
}

async function generateProfessionalResponse(answerText, type, question, questionIndex, answers, totalQuestions, userId) {
  const lower = answerText.toLowerCase();

  // Check for negative/emotional responses
  if (isNegativeResponse(lower)) {
    return createEmbed({
      title: i18n.t('auto.response.negative_title', userId),
      description: i18n.t('auto.response.negative_desc', userId),
      color: config.embed.color.primary,
    });
  }

  // Very short answers
  if (answerText.length < 3) {
    return createEmbed({
      title: i18n.t('auto.response.short_title', userId),
      description: i18n.t('auto.response.short_desc', userId),
      color: config.embed.color.success,
    });
  }

  // Unsure answers
  if (/i (don't|do not) know/i.test(lower) || /not sure/i.test(lower) ||
      /nie wiem/i.test(lower) || /no sé/i.test(lower) || /no estoy seguro/i.test(lower)) {
    return createEmbed({
      title: i18n.t('auto.response.unsure_title', userId),
      description: i18n.t('auto.response.unsure_desc', userId),
      color: config.embed.color.primary,
    });
  }

  // Short answers (3-20 chars) — prompt for more
  if (answerText.length < 20) {
    return createEmbed({
      title: i18n.t('auto.response.short_title', userId),
      description: `${i18n.t('auto.response.short_desc', userId)}\n\n${i18n.t('auto.response.followup_short', userId)}`,
      color: config.embed.color.success,
      fields: [
        {
          name: i18n.t('auto.response.field_progress', userId),
          value: i18n.t('auto.response.field_progress_value', userId, {
            answered: answers.length,
            total: totalQuestions,
            remaining: totalQuestions - answers.length,
          }),
          inline: true,
        },
      ],
    });
  }

  // Answers mentioning ban-related terms in ban appeal
  if (type === 'ban_appeal' && (lower.includes('ban') || lower.includes('appeal') || lower.includes('unban'))) {
    return createEmbed({
      title: i18n.t('auto.response.normal_title', userId),
      description: `${i18n.t('auto.response.normal_desc', userId)}\n\n${i18n.t('auto.response.followup_ban', userId)}`,
      color: config.embed.color.success,
      fields: [
        {
          name: i18n.t('auto.response.field_progress', userId),
          value: i18n.t('auto.response.field_progress_value', userId, {
            answered: answers.length,
            total: totalQuestions,
            remaining: totalQuestions - answers.length,
          }),
          inline: true,
        },
      ],
      footerText: i18n.t('auto.response.footer', userId),
    });
  }

  // Detailed answers
  if (answerText.length > 100) {
    return createEmbed({
      title: i18n.t('auto.response.normal_title', userId),
      description: `${i18n.t('auto.response.normal_desc', userId)}\n\n${i18n.t('auto.response.followup_positive', userId)}`,
      color: config.embed.color.success,
      fields: [
        {
          name: i18n.t('auto.response.field_progress', userId),
          value: i18n.t('auto.response.field_progress_value', userId, {
            answered: answers.length,
            total: totalQuestions,
            remaining: totalQuestions - answers.length,
          }),
          inline: true,
        },
      ],
      footerText: i18n.t('auto.response.footer', userId),
    });
  }

  // Normal answer
  const remaining = totalQuestions - answers.length;

  const desc = remaining <= 2
    ? 'Thank you for your response! We\'re almost done — just a couple more questions to go.'
    : i18n.t('auto.response.normal_desc', userId);

  return createEmbed({
    title: i18n.t('auto.response.normal_title', userId),
    description: desc,
    color: config.embed.color.success,
    fields: [
      {
        name: i18n.t('auto.response.field_progress', userId),
        value: i18n.t('auto.response.field_progress_value', userId, {
          answered: answers.length,
          total: totalQuestions,
          remaining,
        }),
        inline: true,
      },
    ],
    footerText: i18n.t('auto.response.footer', userId),
  });
}

function isNegativeResponse(text) {
  const patterns = [
    /i (didn't|did not) do/i,
    /false (ban|report|accusation)/i,
    /this is (unfair|wrong|a mistake)/i,
    /i'm (innocent|not guilty)/i,
    /i am (innocent|not guilty)/i,
    /you (guys|staff|mods|admins) (made a mistake|are wrong|suck)/i,
    /unfairly (banned|treated|targeted)/i,
    /i did nothing/i,
    /wrongful/i,
    /i want to be unbanned/i,
    /lift my ban/i,
    /nie zrobiłem/i,
    /niesłusznie/i,
    /fałszywe/i,
    /soy inocente/i,
    /no hice nada/i,
    /injusto/i,
    /falso/i,
  ];
  return patterns.some((p) => p.test(text));
}

async function finishAutoResponse(channel, member, type, ticketId, userId) {
  const answers = ANSWERS.get(ticketId) || [];
  const typeName = getTicketTypeName(type);

  const summaryLines = answers.map(
    (a, i) => `**${i + 1}.** ${a.question}\n> ${a.answer}`
  );

  await channel.send({
    embeds: [createEmbed({
      title: i18n.t('auto.summary.title', userId, { type: typeName }),
      description: i18n.t('auto.summary.desc', userId, {
        member,
        answers: summaryLines.join('\n\n'),
      }),
      color: config.embed.color.success,
      footerText: i18n.t('auto.summary.footer', userId),
    })],
  });

  await sendAutoHelp(channel, member, type, answers, ticketId, userId);

  await new Promise((r) => setTimeout(r, 1000));

  await channel.send({
    embeds: [createEmbed({
      title: i18n.t('auto.finish.title', userId),
      description: i18n.t('auto.finish.desc', userId),
      color: config.embed.color.primary,
    })],
    components: [buildEscalateButtons(ticketId, userId)],
  });

  ANSWERS.delete(ticketId);
}

async function sendAutoHelp(channel, member, type, answers, ticketId, userId) {
  const typeName = getTicketTypeName(type);

  switch (type) {
    case 'ban_appeal': {
      const reason = answers.find((a) =>
        a.question.toLowerCase().includes('why') || a.question.toLowerCase().includes('lifted')
      );

      const reasonStr = reason
        ? `📌 You mentioned: "${reason.answer.substring(0, 200)}${reason.answer.length > 200 ? '...' : ''}"`
        : '';

      await channel.send({
        embeds: [createEmbed({
          title: i18n.t('auto.help.ban_appeal.title', userId),
          description: i18n.t('auto.help.ban_appeal.desc', userId, { reason: reasonStr }),
          color: config.embed.color.primary,
          fields: [
            {
              name: i18n.t('auto.help.ban_appeal.field_important', userId),
              value: i18n.t('auto.help.ban_appeal.field_important_value', userId),
            },
          ],
        })],
      });
      break;
    }

    case 'bug_report': {
      await channel.send({
        embeds: [createEmbed({
          title: i18n.t('auto.help.bug_report.title', userId),
          description: i18n.t('auto.help.bug_report.desc', userId),
          color: config.embed.color.primary,
        })],
      });
      break;
    }

    case 'player_report': {
      await channel.send({
        embeds: [createEmbed({
          title: i18n.t('auto.help.player_report.title', userId),
          description: i18n.t('auto.help.player_report.desc', userId),
          color: config.embed.color.primary,
        })],
      });
      break;
    }

    case 'general_support': {
      await channel.send({
        embeds: [createEmbed({
          title: i18n.t('auto.help.general_support.title', userId),
          description: i18n.t('auto.help.general_support.desc', userId),
          color: config.embed.color.primary,
        })],
      });
      break;
    }

    case 'purchase_support': {
      await channel.send({
        embeds: [createEmbed({
          title: i18n.t('auto.help.purchase_support.title', userId),
          description: i18n.t('auto.help.purchase_support.desc', userId),
          color: config.embed.color.primary,
        })],
      });
      break;
    }

    default: {
      await channel.send({
        embeds: [createEmbed({
          title: i18n.t('auto.help.default.title', userId, { type: typeName }),
          description: i18n.t('auto.help.default.desc', userId),
          color: config.embed.color.primary,
        })],
      });
    }
  }
}

async function lookupBan(guild, id) {
  try {
    const bans = await guild.bans.fetch();
    const byId = bans.get(id);
    if (byId) return byId;

    const idDigits = id.match(/\d+/);
    if (idDigits) {
      const byUserId = bans.get(idDigits[0]);
      if (byUserId) return byUserId;
    }

    const byName = bans.find(
      (b) =>
        b.user.tag.toLowerCase().includes(id.toLowerCase()) ||
        b.user.username.toLowerCase().includes(id.toLowerCase())
    );

    return byName || null;
  } catch (error) {
    logger.warn(`Could not fetch bans for guild ${guild.id}: ${error.message}`);
    return null;
  }
}

function extractBanId(text) {
  const idMatch = text.match(/\b\d{17,19}\b/);
  if (idMatch) return idMatch[0];

  if (/^\d{17,19}$/.test(text.trim())) return text.trim();

  return null;
}

function getTicketTypeName(type) {
  const typeMap = {
    ban_appeal: 'Ban Appeal',
    bug_report: 'Bug Report',
    player_report: 'Player Report',
    general_support: 'General Support',
    purchase_support: 'Purchase Support',
  };
  return typeMap[type] || type;
}

function buildEscalateButtons(ticketId, userId = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_escalate_${ticketId}`)
      .setLabel(i18n.t('auto.button.request_staff', userId))
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🙋'),
    new ButtonBuilder()
      .setCustomId(`ticket_resolved_${ticketId}`)
      .setLabel(i18n.t('auto.button.im_all_set', userId))
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
  );
}

module.exports = {
  startAutoResponse,
};
