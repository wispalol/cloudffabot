const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const config = require('../config/client');
const { createEmbed } = require('../utils/embeds');
const logger = require('../config/logger');

const ANSWERS = new Map();

async function startAutoResponse(channel, member, type, ticketId) {
  const typeName = getTicketTypeName(type);
  const questions = config.ticket.questions[type];

  // Professional welcome
  await channel.send({
    embeds: [createEmbed({
      title: `👋 Welcome to ${typeName}`,
      description:
        `Hello ${member}, thank you for reaching out. I'm the CloudFFA support assistant and I'll help you get started.\n\n` +
        'I need to ask you a few questions to better understand your situation. Please answer each question one at a time, and I will review your responses as we go.',
      color: config.embed.color.primary,
      fields: questions
        ? [
            {
              name: '📝 Questions',
              value: `You have **${questions.length} question${questions.length > 1 ? 's' : ''}** to answer. I'll guide you through each one.`,
            },
            {
              name: '⏱ Time Limit',
              value: 'You have **5 minutes** per question. If you need more time, just let me know.',
            },
          ]
        : [],
      footerText: 'I am an automated assistant. Type "human" anytime to speak with staff.',
    })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_escalate_${ticketId}`)
          .setLabel('Speak to Staff')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🙋')
      ),
    ],
  });

  if (!questions || questions.length === 0) {
    await channel.send({
      embeds: [createEmbed({
        title: '📬 Ticket Created',
        description: `Your **${typeName}** ticket has been created. A staff member will be with you shortly.\n\nIf you need immediate assistance, click the button below.`,
        color: config.embed.color.success,
      })],
      components: [buildEscalateButtons(ticketId)],
    });
    return;
  }

  await new Promise((r) => setTimeout(r, 1500));
  ANSWERS.set(ticketId, []);
  await askNextQuestion(channel, member, type, ticketId, questions, 0);
}

async function askNextQuestion(channel, member, type, ticketId, questions, index) {
  if (index >= questions.length) {
    return finishAutoResponse(channel, member, type, ticketId);
  }

  const question = questions[index];
  const qNum = index + 1;

  await channel.send({
    embeds: [createEmbed({
      title: `📌 Question ${qNum} of ${questions.length}`,
      description: `> ${question}`,
      color: config.embed.color.warning,
      fields: type === 'ban_appeal' && index === 0
        ? [
            {
              name: '💡 Tip',
              value: 'If you have a **Ban ID** or **User ID** from your ban notification, include it in your answer so I can look up the details.',
            },
          ]
        : [
            {
              name: '💬 Instructions',
              value: `Please type your answer below. You have **5 minutes**.`,
            },
          ],
      footerText: `Question ${qNum} of ${questions.length}`,
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

    const answers = ANSWERS.get(ticketId) || [];
    answers.push({ question, answer: answerText });
    ANSWERS.set(ticketId, answers);

    // Professional contextual response based on their answer
    const response = generateProfessionalResponse(answerText, type, question, index, answers, questions.length);
    await channel.send({ embeds: [response] });

    // Check for ban ID in any answer for ban appeals
    if (type === 'ban_appeal') {
      const banId = extractBanId(answerText);
      if (banId) {
        await channel.send({
          embeds: [createEmbed({
            title: '🔍 Checking ban records...',
            description: `I found a potential Ban ID in your response: \`${banId}\`. Let me check our records.`,
            color: config.embed.color.primary,
          })],
        });

        const banInfo = await lookupBan(channel.guild, banId);
        if (banInfo) {
          await channel.send({
            embeds: [createEmbed({
              title: '📋 Ban Record Found',
              description:
                `**User:** ${banInfo.user.tag} \`(${banInfo.user.id})\`\n` +
                `**Reason:** ${banInfo.reason || 'No reason recorded'}\n` +
                `**Status:** Currently banned\n\n` +
                `This information will be included with your appeal for the staff team to review.`,
              color: config.embed.color.success,
              footerText: 'You can continue answering questions below.',
            })],
          });
        } else {
          await channel.send({
            embeds: [createEmbed({
              title: '❌ Ban Not Found',
              description:
                `I couldn't find a ban matching \`${banId}\`. This could mean:\n` +
                `• The ID may be incorrect\n` +
                `• The ban may have already been removed\n` +
                `• This ID might be something else entirely\n\n` +
                `Don't worry — our staff will be able to look into this further. Please continue with your answers.`,
              color: config.embed.color.error,
            })],
          });
        }
      }

      // Also check for denial phrases
      const denialPhrases = ['didn\'t do', 'did not do', 'innocent', 'false ban', 'unfair', 'did nothing', 'wrongful', 'mistake'];
      const isDenial = denialPhrases.some((p) => answerText.toLowerCase().includes(p));
      if (isDenial && !banId) {
        await channel.send({
          embeds: [createEmbed({
            title: '🤝 I understand your concern',
            description:
              'I understand you feel this ban may have been issued in error. Our staff team will carefully review all the evidence when processing your appeal.\n\n' +
              'In the meantime, please continue answering the remaining questions so we have a complete picture of your situation.',
            color: config.embed.color.primary,
            footerText: 'Honesty is the best approach for a successful appeal.',
          })],
        });
      }
    }

    // Brief confirmation before next question
    await new Promise((r) => setTimeout(r, 1000));
    await askNextQuestion(channel, member, type, ticketId, questions, index + 1);
  } catch {
    await channel.send({
      embeds: [createEmbed({
        title: '⏰ Time Expired',
        description:
          'The time limit for answering has passed. Your answers so far have been saved and will be reviewed by our staff team.\n\n' +
          'If you still need help, click the button below to request staff assistance.',
        color: config.embed.color.warning,
      })],
      components: [buildEscalateButtons(ticketId)],
    });
  }
}

function generateProfessionalResponse(answerText, type, question, questionIndex, answers, totalQuestions) {
  const lower = answerText.toLowerCase();

  if (isNegativeResponse(lower)) {
    return createEmbed({
      title: '✅ Thank you for sharing',
      description:
        'I appreciate you being honest about how you feel. Your perspective is valuable and will be reviewed as part of your case.\n\n' +
        'Please continue with the remaining questions so we can gather all the necessary information.',
      color: config.embed.color.primary,
    });
  }

  if (answerText.length < 3) {
    return createEmbed({
      title: '📝 Answer recorded',
      description: 'Thank you. I\'ve noted your response. Please take your time with the next question — providing detailed information helps us process your case more effectively.',
      color: config.embed.color.success,
    });
  }

  if (/i (don't|do not) know/i.test(lower) || /not sure/i.test(lower)) {
    return createEmbed({
      title: '📝 That\'s okay',
      description: 'No worries. Just provide whatever information you can remember. If anything else comes to mind later, you can share it freely in this channel.',
      color: config.embed.color.primary,
    });
  }

  const remaining = totalQuestions - answers.length;

  return createEmbed({
    title: '📝 Answer received',
    description: 'Thank you for your response. I have recorded your answer and we are making progress.',
    color: config.embed.color.success,
    fields: [
      {
        name: '📊 Progress',
        value: `Answered **${answers.length}** of **${totalQuestions}** (${remaining} remaining)`,
        inline: true,
      },
    ],
    footerText: 'Providing detailed answers helps resolve your case faster.',
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
  ];
  return patterns.some((p) => p.test(text));
}

async function finishAutoResponse(channel, member, type, ticketId) {
  const answers = ANSWERS.get(ticketId) || [];
  const typeName = getTicketTypeName(type);

  const summaryLines = answers.map(
    (a, i) => `**${i + 1}.** ${a.question}\n> ${a.answer}`
  );

  await channel.send({
    embeds: [createEmbed({
      title: `📋 ${typeName} — Summary of Your Case`,
      description:
        `Thank you for answering all the questions, ${member}. Here is a summary of what you shared:\n\n${summaryLines.join('\n\n')}`,
      color: config.embed.color.success,
      footerText: 'Please review the above. If anything is incorrect, feel free to correct it.',
    })],
  });

  await sendAutoHelp(channel, member, type, answers, ticketId);

  await new Promise((r) => setTimeout(r, 1000));

  await channel.send({
    embeds: [createEmbed({
      title: '✅ All Set',
      description:
        'I have recorded all of your responses. Here is what happens next:\n\n' +
        '• Your case has been logged in our system\n' +
        '• A staff member will review it as soon as possible\n' +
        '• You will be notified here when there is an update\n\n' +
        '**If you need immediate assistance**, click the button below to request a staff member.\n' +
        '**If you are satisfied**, you can close the ticket using the button at the top of this channel.',
      color: config.embed.color.primary,
    })],
    components: [buildEscalateButtons(ticketId)],
  });

  ANSWERS.delete(ticketId);
}

async function sendAutoHelp(channel, member, type, answers, ticketId) {
  const typeName = getTicketTypeName(type);

  switch (type) {
    case 'ban_appeal': {
      const reason = answers.find((a) =>
        a.question.toLowerCase().includes('why') || a.question.toLowerCase().includes('lifted')
      );

      await channel.send({
        embeds: [createEmbed({
          title: '🔨 Ban Appeal — What Happens Next',
          description:
            'Thank you for submitting your ban appeal. Here is the process:\n\n' +
            '**1. Review** — A staff member will review your appeal and the reason for your ban\n' +
            '**2. Decision** — You will receive a response: Approved or Denied\n' +
            '**3. Resolution** — If approved, your ban will be lifted\n\n' +
            '**Tips for a successful appeal:**\n' +
            '• Be honest and take responsibility where appropriate\n' +
            '• Show that you understand the rule that was broken\n' +
            '• Explain what you will do differently in the future\n\n' +
            `${reason ? `📌 You mentioned: "${reason.answer.substring(0, 200)}${reason.answer.length > 200 ? '...' : ''}"` : ''}\n\n` +
            '⏱ Response time is typically within **24 hours**.',
          color: config.embed.color.primary,
          fields: [
            {
              name: '📌 Important',
              value: 'Repeatedly pinging staff or creating multiple tickets may negatively affect your appeal.',
            },
          ],
        })],
      });
      break;
    }

    case 'bug_report': {
      await channel.send({
        embeds: [createEmbed({
          title: '🐛 Bug Report — Next Steps',
          description:
            'Thank you for reporting this bug. Your report helps us improve the server.\n\n' +
            '**What happens next:**\n' +
            '• Your report is logged in our system\n' +
            '• Our team will attempt to reproduce the bug\n' +
            '• If confirmed, it will be added to our fix queue\n\n' +
            '**To help us resolve this faster:**\n' +
            '• If you have screenshots or video, please share them here\n' +
            '• Note whether this happens consistently or randomly\n' +
            '• Mention any steps we can follow to reproduce it\n\n' +
            'You will be updated here once we have more information.',
          color: config.embed.color.primary,
        })],
      });
      break;
    }

    case 'player_report': {
      await channel.send({
        embeds: [createEmbed({
          title: '👤 Player Report — Process',
          description:
            'Thank you for submitting your report. Here is how it will be handled:\n\n' +
            '**1. Review** — A moderator will review the evidence provided\n' +
            '**2. Investigation** — The reported player may be contacted\n' +
            '**3. Action** — If rules were broken, appropriate action will be taken\n\n' +
            '⚠️ **Please note:**\n' +
            '• False reports may result in action against your account\n' +
            '• Do not share this report in public channels\n' +
            '• You will be notified of the outcome',
          color: config.embed.color.primary,
        })],
      });
      break;
    }

    case 'general_support': {
      await channel.send({
        embeds: [createEmbed({
          title: '❓ General Support — Resources',
          description:
            'Thank you for reaching out. While you wait for a staff member, here are resources that may help:\n\n' +
            '📖 **Check the FAQ** — Common questions are answered in our FAQ channel\n' +
            '🔍 **Search the documentation** — Visit our website or documentation\n' +
            '💬 **Community help** — Other members may be able to assist\n\n' +
            'If you still need help after checking these, staff will be with you shortly.',
          color: config.embed.color.primary,
        })],
      });
      break;
    }

    case 'purchase_support': {
      await channel.send({
        embeds: [createEmbed({
          title: '💳 Purchase Support — Next Steps',
          description:
            'Thank you for contacting purchase support. To help us assist you, please have the following ready:\n\n' +
            '• Your **transaction ID** or receipt number\n' +
            '• The **email** used for the purchase\n' +
            '• The **product or service** you purchased\n\n' +
            'Our team will verify your purchase and work to resolve the issue. You will be updated in this channel.',
          color: config.embed.color.primary,
        })],
      });
      break;
    }

    default: {
      await channel.send({
        embeds: [createEmbed({
          title: `ℹ️ ${typeName} — Information Received`,
          description:
            'Your information has been recorded and will be reviewed by our team. Please wait for a staff member to respond.',
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

function buildEscalateButtons(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_escalate_${ticketId}`)
      .setLabel('Request Staff')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🙋'),
    new ButtonBuilder()
      .setCustomId(`ticket_resolved_${ticketId}`)
      .setLabel("I'm All Set")
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
  );
}

module.exports = {
  startAutoResponse,
};
