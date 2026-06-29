const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config/client');
const { createEmbed } = require('../utils/embeds');
const logger = require('../config/logger');
const i18n = require('../i18n');
const { lookupAnticheatBan } = require('../database/anticheatDb');
const { getDb } = require('../database/database');
const { generateTranscript } = require('../utils/transcript');
const { searchGoogle } = require('../utils/googleSearch');
const { summarizeFromItems } = require('../utils/summarizer');
const { aiSummarize } = require('../utils/aiSummarizer');
const path = require('path');
const fs = require('fs');

const ANSWERS = new Map();
const HUMAN_KEYWORDS = ['human', 'staff', 'person', 'agent', 'real person', 'człowiek', 'personel', 'humano', 'persona real'];

function resolveLanguageFromInput(input) {
  const lower = input.toLowerCase().trim();
  const locales = i18n.getLocaleInfo();
  const codeMatch = locales.find(l => l.code === lower);
  if (codeMatch) return codeMatch.code;
  const nameMatch = locales.find(l => l.name.toLowerCase() === lower);
  if (nameMatch) return nameMatch.code;
  const partialMatch = locales.find(l => lower.includes(l.code) || l.name.toLowerCase().includes(lower));
  if (partialMatch) return partialMatch.code;
  const langAliases = {
    english: 'en', spanish: 'es', polish: 'pl',
    inglés: 'es', español: 'es', polski: 'pl',
    angielski: 'en', hiszpański: 'es',
    ingles: 'es', polaco: 'pl',
  };
  if (langAliases[lower]) return langAliases[lower];
  return null;
}

const LANGUAGE_SKIP = new Set(['no', 'nie', 'skip', 'none', 'nope', 'no thanks', 'no thank you', 'nie dziękuję', 'no gracias', 'no, thanks']);

async function askLanguagePreference(channel, member, ticketId, userId) {
  const current = i18n.getUserLocale(userId);
  const localeInfo = i18n.getLocaleInfo();
  const currentName = localeInfo.find(l => l.code === current);
  const example = localeInfo.find(l => l.code !== current);

  const languageList = localeInfo.map(l => `${l.flag} **${l.name}**`).join('\n');

  await channel.send({
    embeds: [createEmbed({
      title: i18n.t('auto.language_prompt.title', userId),
      description: i18n.t('auto.language_prompt.desc', userId, {
        languages: languageList,
        example: example ? example.name : 'Polish',
        current: currentName ? `${currentName.flag} ${currentName.name}` : 'English',
      }),
      color: config.embed.color.primary,
    })],
  });

  try {
    const collected = await channel.awaitMessages({
      filter: (m) => m.author.id === member.id && !m.author.bot,
      max: 1,
      time: 60 * 1000,
      errors: ['time'],
    });

    const answer = collected.first().content.trim();

    if (LANGUAGE_SKIP.has(answer.toLowerCase())) {
      await channel.send({
        embeds: [createEmbed({
          title: i18n.t('auto.language_prompt.kept_title', userId),
          description: i18n.t('auto.language_prompt.kept_desc', userId, {
            current: currentName ? `${currentName.flag} ${currentName.name}` : 'English',
          }),
          color: config.embed.color.success,
        })],
      });
      return null;
    }

    const resolved = resolveLanguageFromInput(answer);
    if (resolved && i18n.setUserLocale(userId, resolved)) {
      const chosen = localeInfo.find(l => l.code === resolved);
      await channel.send({
        embeds: [createEmbed({
          title: i18n.t('auto.language_prompt.changed_title', userId),
          description: i18n.t('auto.language_prompt.changed_desc', userId, {
            name: chosen.name,
            flag: chosen.flag,
          }),
          color: config.embed.color.success,
        })],
      });
      return userId;
    }

    await channel.send({
      embeds: [createEmbed({
        title: i18n.t('auto.language_prompt.invalid_title', userId),
        description: i18n.t('auto.language_prompt.invalid_desc', userId, {
          languages: localeInfo.map(l => `\`${l.name}\``).join(', '),
          current: currentName ? `${currentName.flag} ${currentName.name}` : 'English',
        }),
        color: config.embed.color.error,
      })],
    });

    return null;
  } catch {
    await closeAndDeleteTicket(channel, ticketId, userId);
    return null;
  }
}

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

  const switched = await askLanguagePreference(channel, member, ticketId, effectiveUserId);
  const finalUserId = switched || effectiveUserId;
  const finalQuestions = i18n.getQuestions(type, finalUserId);

  await askNextQuestion(channel, member, type, ticketId, finalQuestions, 0, finalUserId);
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

    // --- Search Integration ---
    // If user's answer looks like a question, try to search for it immediately
    const isLikelyQuestion = (() => {
      const cleanContent = answerText.trim().toLowerCase();
      // If it ends with a question mark and isn't too short, it's a question
      if (cleanContent.endsWith('?') && cleanContent.length > 5) return true;
      
      // Check for question starters or "how to"
      const questionStarters = /^(who|what|when|where|why|how|is|are|do|does|did|can|could|should|would|will|how to|how do i|can i|where is)\b/i;
      if (questionStarters.test(cleanContent)) {
        // Ensure it's long enough to be a real question, not just "how?"
        return cleanContent.split(' ').length >= 3;
      }
      return false;
    })();

    if (isLikelyQuestion && answerText.length < 300) {
      const query = answerText.replace(/\?+$/, '').trim();
      if (query.length >= 5) {
        // Wait a moment for the professional response to be seen
        await new Promise((r) => setTimeout(r, 1000));
        const searchStatusMsg = await channel.send({ content: `🔍 Searching for: **${query}**...` });
        
        try {
          const { items, searchInformation } = await searchGoogle(query, 3);
          
          const searchEmbed = new EmbedBuilder()
            .setTitle(`🔍 I found some info for: ${query.length > 50 ? query.substring(0, 47) + '...' : query}`)
            .setColor(config.embed.color.primary)
            .setFooter({ text: 'I hope this helps while you wait for staff!' });

          if (searchInformation?.error) {
            let errorDesc = `⚠️ I encountered an issue while searching (Error ${searchInformation.error}). A staff member will be with you shortly!`;
            
            // Specifically handle the "service disabled" 403 error
            if (searchInformation.error === 403 && (searchInformation.errorText?.includes('SERVICE_DISABLED') || searchInformation.errorText?.includes('accessNotConfigured'))) {
              errorDesc = `⚠️ **Search API Configuration Issue.**
              
              The bot is having trouble accessing the search service. Please check:
              
              1. **Tavily API Key:** Ensure this is set in your hosting variables (Highly Recommended).
              2. **Google API:** If using Google, ensure the API is enabled and billing is linked.
              
              A staff member will assist you shortly!`;
            }
            
            searchEmbed.setDescription(errorDesc);
            await searchStatusMsg.edit({ content: null, embeds: [searchEmbed] });
            await new Promise((r) => setTimeout(r, 8000));
            return;
          }

          if (items && items.length > 0) {
            let summary = await aiSummarize(query, items);
            if (summary) {
              searchEmbed.setDescription(summary);
            } else {
              const heuristicSummary = summarizeFromItems(items, 500);
              if (heuristicSummary) {
                searchEmbed.setDescription(heuristicSummary);
              } else {
                searchEmbed.setDescription('I couldn\'t find a quick answer, but I found some helpful links for you:');
              }
            }

            if (searchInformation?.source) {
              const source = searchInformation.source.charAt(0).toUpperCase() + searchInformation.source.slice(1);
              searchEmbed.setFooter({ text: `Results from ${source} • I hope this helps while you wait for staff!` });
            }

            for (let i = 0; i < Math.min(items.length, 3); i++) {
              const it = items[i];
              const title = it.title || 'No title';
              const snippet = it.snippet ? it.snippet.replace(/\n/g, ' ') : '';
              const link = it.link || it.formattedUrl || '';
              const name = `${i + 1}. ${title}`.slice(0, 250);
              let value = snippet;
              if (link) value += `\n\n${link}`;
              value = value.slice(0, 1020);
              searchEmbed.addFields({ name, value });
            }

            const buttons = [];
            for (let i = 0; i < Math.min(items.length, 3, 5); i++) {
              const it = items[i];
              const label = (it.title || it.formattedUrl || `Result ${i + 1}`).slice(0, 80);
              const url = it.link || it.formattedUrl || null;
              if (url) buttons.push(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));
            }

            const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
            await searchStatusMsg.edit({ content: null, embeds: [searchEmbed], components });
            
            // Wait an extra 5 seconds so the user can actually read the result
            // before the next question scrolls it away
            await new Promise((r) => setTimeout(r, 5000));
          } else {
            // No direct results found, but let the user know we tried
            searchEmbed.setDescription(`I couldn't find any specific information for **${query}** on Google. A staff member will be with you shortly to assist!
            
            *Tip: Ensure your Search Engine ID (CX) is configured to "Search the entire web" in the Google Programmable Search Engine control panel for better results.*`);
            await searchStatusMsg.edit({ content: null, embeds: [searchEmbed] });
            
            // Wait a few seconds before moving on
            await new Promise((r) => setTimeout(r, 6000));
          }
        } catch (err) {
          logger.error('Search during ticket collection failed:', err);
          await searchStatusMsg.edit({ content: '⚠️ An error occurred while searching. Moving on with your ticket...' }).catch(() => {});
          await new Promise((r) => setTimeout(r, 2000));
          await searchStatusMsg.delete().catch(() => {});
        }
      }
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

    // Ban appeal specific: check for ban ID / player name (only on first question)
    if (type === 'ban_appeal' && index === 0) {
      const banId = extractBanId(answerText);
      const playerName = extractPlayerName(answerText);
      const banStringId = extractBanStringId(answerText);
      const uuid = extractUuid(answerText);
      const antiCheatId = extractNumericId(answerText);
      const identifier = banStringId || uuid || playerName || antiCheatId || banId;

      if (identifier) {
        await channel.send({
          embeds: [createEmbed({
            title: i18n.t('auto.ban.checking_title', userId),
            description: i18n.t('auto.ban.checking_desc', userId, { banId: identifier }),
            color: config.embed.color.primary,
          })],
        });

        // Discord guild ban lookup (only if a Discord ID was provided)
        if (banId) {
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

        // Anticheat DB lookup (by player name, UUID, or ban ID)
        const acBan = await lookupAnticheatBan(identifier);
        if (acBan) {
          const bannedAt = acBan.banned_at ? new Date(acBan.banned_at).toLocaleString() : 'Unknown';
          const expires = acBan.expires_at ? new Date(acBan.expires_at).toLocaleString() : 'Permanent';
          const status = acBan.unbanned ? 'Unbanned' : 'Active';
          const hackLabel = acBan.check_name || 'Unknown Hack';

          await channel.send({
            embeds: [createEmbed({
              title: '🚨 ANTICHEAT RECORD FOUND',
              description: `Our systems have **conclusively detected** the use of prohibited modifications on your account. This is **not** a matter of opinion — the evidence is permanently recorded in our database.\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `**Player:** \`${acBan.player_name || 'Unknown'}\`\n` +
                `**UUID:** \`${acBan.player_uuid || 'N/A'}\`\n` +
                `**Detection:** \`${hackLabel}\`\n` +
                `**Date:** ${bannedAt}\n` +
                `**Expires:** ${expires}\n` +
                `**Status:** ${status}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `You were banned for **${hackLabel}**. This is a clear violation of our rules.`,
              color: 0xED4245,
              footerText: 'This record cannot be disputed — denial will not override system evidence.',
            })],
          });

          // Store anticheat record for verdict display
          const acAnswers = ANSWERS.get(ticketId) || [];
          acAnswers.push({
            question: '_anticheat_record',
            answer: JSON.stringify({
              hackLabel: hackLabel,
              playerName: acBan.player_name || 'Unknown',
              playerUuid: acBan.player_uuid || '',
              bannedAt: acBan.banned_at || '',
              expiresAt: acBan.expires_at || '',
              unbanned: acBan.unbanned ? true : false,
              banId: acBan.ban_id || '',
            }),
          });
          ANSWERS.set(ticketId, acAnswers);

          // Hard hacks → immediate verdict, soft hacks → continue with questions
          const hardHacks = ['killaura', 'autoclicker', 'reach', 'fly', 'speed', 'bhop', 'antiknockback', 'velocity', 'scaffold', 'tower', 'nuker', 'cheststealer', 'aimassist', 'aimbot', 'triggerbot', 'esp', 'wallhack', 'xray', 'noslowdown', 'inventorymove', 'antibot', 'crasher', 'illegal', 'blink', 'phase', 'disabler'];
          const isHardHack = hardHacks.some(h => hackLabel.toLowerCase().includes(h));
          if (isHardHack) {
            await new Promise((r) => setTimeout(r, 1000));
            return finishAutoResponse(channel, member, type, ticketId, userId);
          }

          // Soft hack: use modified questions (skip "Why were you banned?" etc.)
          const acQuestions = i18n.getQuestions('ban_appeal_with_record', userId);
          if (acQuestions.length > 0) {
            questions = acQuestions.map(q => q.replace(/\{hack\}/g, hackLabel));
          }
        } else if (process.env.ANTICHEAT_DB_HOST) {
          await channel.send({
            embeds: [createEmbed({
              title: i18n.t('auto.ban.anticheat_not_found', userId),
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
    return;
  } catch (err) {
    if (err.name !== 'Error' || err.message !== 'time') {
      logger.error('Error in askNextQuestion loop:', err);
    }
    await closeAndDeleteTicket(channel, ticketId, userId);
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

  const analysis = await sendAutoHelp(channel, member, type, answers, ticketId, userId);

  // --- Auto-Search Integration ---
  // If it's a general support or purchase support ticket, try to find an automated answer
  if (type === 'general_support' || type === 'purchase_support' || type === 'other') {
    const mainQuestion = answers.find(a => 
      a.question.toLowerCase().includes('help') || 
      a.question.toLowerCase().includes('request') ||
      a.question.toLowerCase().includes('issue') ||
      a.question.toLowerCase().includes('purchase') ||
      a.question.toLowerCase().includes('today')
    );

    if (mainQuestion && mainQuestion.answer && mainQuestion.answer.length > 5) {
      const query = mainQuestion.answer.trim();
      try {
        const { items, searchInformation } = await searchGoogle(query, 3);
        if (searchInformation?.error) return; // ignore errors here

        if (items && items.length > 0) {
          const searchEmbed = new EmbedBuilder()
            .setTitle(`🔍 Automatic Search: ${query.length > 50 ? query.substring(0, 47) + '...' : query}`)
            .setColor(config.embed.color.primary);

          let summary = await aiSummarize(query, items);
          if (!summary) {
            summary = summarizeFromItems(items, 500);
          }

          if (summary) {
            searchEmbed.setDescription(summary);
          } else {
            searchEmbed.setDescription('I couldn\'t find a quick answer, but I found some helpful links for you:');
          }

          if (searchInformation?.source) {
            const source = searchInformation.source.charAt(0).toUpperCase() + searchInformation.source.slice(1);
            searchEmbed.setFooter({ text: `Results from ${source} • I found some resources that might help you immediately.` });
          } else {
            searchEmbed.setFooter({ text: 'I found some resources that might help you immediately.' });
          }

          for (let i = 0; i < Math.min(items.length, 3); i++) {
            const it = items[i];
            const title = it.title || 'No title';
            const snippet = it.snippet ? it.snippet.replace(/\n/g, ' ') : '';
            const link = it.link || it.formattedUrl || '';
            const name = `${i + 1}. ${title}`.slice(0, 250);
            let value = snippet;
            if (link) value += `\n\n${link}`;
            value = value.slice(0, 1020);
            searchEmbed.addFields({ name, value });
          }

          const buttons = [];
          for (let i = 0; i < Math.min(items.length, 3, 5); i++) {
            const it = items[i];
            const label = (it.title || it.formattedUrl || `Result ${i + 1}`).slice(0, 80);
            const url = it.link || it.formattedUrl || null;
            if (url) buttons.push(new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url));
          }

          const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];
          await channel.send({ embeds: [searchEmbed], components });
        }
      } catch (err) {
        logger.error('Auto-search in ticket failed:', err);
      }
    }
  }

  await new Promise((r) => setTimeout(r, 1000));

  const isDenied = analysis && (analysis.verdict === 'fair' || analysis.verdict === 'anticheat_confirmed');
  if (isDenied) {
    const isAcConfirmed = analysis.verdict === 'anticheat_confirmed';
    const verdictLabel = isAcConfirmed ? 'Cheating Confirmed' : 'Appeal Denied';
    const verdictColor = isAcConfirmed ? 0xED4245 : 0x57F287;
    let verdictFields = [];
    if (isAcConfirmed && analysis.hackLabel) {
      verdictFields.push(
        { name: '🚨 Verdict', value: `**Cheating Confirmed** — our systems detected \`${analysis.hackLabel}\` on your account.`, inline: false },
      );
    } else {
      verdictFields.push(
        { name: '🚨 Verdict', value: '**Appeal Denied** — your responses indicated that you used unfair modifications.', inline: false },
      );
    }

    await channel.send({
      embeds: [createEmbed({
        title: '🔒 Appeal Closed — ' + verdictLabel,
        description: 'Your case has been reviewed and a decision has been made. The channel will be deleted shortly.\n\nA transcript has been saved for staff reference. You will **not** be able to reopen this ticket.',
        color: verdictColor,
        fields: verdictFields,
      })],
    });
    await new Promise((r) => setTimeout(r, 5000));
    await autoCloseTicket(channel, ticketId, userId);
    ANSWERS.delete(ticketId);
    return;
  }

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

function analyzeBanAppeal(answers) {
  const allText = answers.map(a => a.answer.toLowerCase()).join(' ');

  const cheatClients = [
    'meteor client', 'meteor', 'metore client', 'metore', 'metor',
    'wurst', 'wurst client',
    'liquidbounce', 'liquid bounce',
    'impact client', 'impact',
    'aristois',
    'future client', 'future',
    'rusherhack', 'rusher hack', 'rusher',
    'kami blue', 'kami',
    'bleachhack', 'bleach hack',
    'inertia', 'inertia client',
    'thunderhack', 'thunder hack',
    'lambda',
    'pyro client', 'pyro',
    'phobos',
    'gamesense', 'game sense',
    'catalyst',
    'sigma',
    'flux',
    'tenacity',
    'rise',
    'novoline',
    'moon',
    'augustus',
    'slinky',
    'nightx', 'night x',
    'polar client', 'polar',
    'opal client', 'opal',
    'celestial',
    'ares',
    'boze',
    'hacked client', 'cheat client', 'hax', 'client hacks', 'cheating client', 'mods client',
    'vape', 'vape v4', 'vapev4', 'dortware', 'bongware', 'crystal client',
    'lunar client hacks', 'badlion hacks',
    'opcional',

    'autototem', 'auto totem',
    'autocrystal', 'auto crystal',
    'killaura', 'kill aura', 'ka',
    'triggerbot', 'trigger bot',
    'aimassist', 'aim assist',
    'reach',
    'velocity', 'antiknockback', 'anti knockback', 'anti-knockback',
    'criticals',
    'autoarmor', 'auto armor',
    'autoweapon', 'auto weapon',
    'autoeat', 'auto eat',
    'autogapple', 'auto gapple',
    'autosoup', 'auto soup',
    'autofish', 'auto fish',
    'automine', 'auto mine',
    'nuker',
    'xray', 'x-ray', 'x ray',
    'esp',
    'playeresp', 'player esp',
    'mobesp', 'mob esp',
    'chestesp', 'chest esp',
    'itemesp', 'item esp',
    'tracers',
    'nametags', 'name tags',
    'search',
    'freecam', 'free cam',
    'fullbright', 'full bright',
    'nofall', 'no fall',
    'flight', 'fly hack', 'flyhack',
    'elytrafly', 'elytra fly',
    'speed',
    'sprint',
    'step',
    'highjump', 'high jump',
    'longjump', 'long jump',
    'jesus',
    'spider',
    'fastbreak', 'fast break',
    'fastplace', 'fast place',
    'fastuse', 'fast use',
    'scaffold',
    'safewalk', 'safe walk',
    'timer',
    'blink',
    'noslow', 'no slow', 'noslowdown',
    'inventorymove', 'inventory move',
    'antiafk', 'anti afk',
    'autoreconnect', 'auto reconnect',
    'autorespawn', 'auto respawn',
    'baritone',
    'pathfinding',
    'clickgui', 'click gui',
    'packetfly', 'packet fly',
    'phase',
    'antilevitation', 'anti levitation',
    'norotate', 'no rotate',
    'fakelag', 'fake lag',
    'fakeplayer', 'fake player',
    'surround',
    'holeesp', 'hole esp',
    'burrow',
    'selftrap', 'self trap',
    'anchoraura', 'anchor aura',
    'bedaura', 'bed aura',
    'bowaimbot', 'bow aimbot',
    'bowspam', 'bow spam',
    'pearlassist', 'pearl assist',
    'crystaloptimizer', 'crystal optimizer',
    'targetstrafe', 'target strafe',
    'chams',
    'storageesp', 'storage esp',
    'blockesp', 'block esp',
    'waypoints',
    'antiblind', 'anti blind',
    'norender', 'no render',
    'hud editor',
    'pingspoof', 'ping spoof',
    'antibot', 'anti bot',
    'antihunger', 'anti hunger',
    'fastladder', 'fast ladder',
    'parkour',
    'middleclickfriend', 'middle click friend',
    'autogg', 'auto gg',
    'autoez', 'auto ez',
    'autosign', 'auto sign',
    'chattweaks', 'chat tweaks',
    'autotool', 'auto tool',
    'autowalk', 'auto walk',
    'autosprint', 'auto sprint',
    'autosneak', 'auto sneak',
  ];

  // Sort by length descending (longest first) to match multi-word clients before single words
  const sortedClients = [...cheatClients].sort((a, b) => b.length - a.length);
  const escapedClients = sortedClients.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  // Any mention of a known cheat client counts as admission (no preceding verb required)
  const cheatClientMention = new RegExp(`(?:${escapedClients.join('|')})`, 'i').test(allText);

  const admitsCheating = cheatClientMention ||
    /(i|admit|confess|yeah|yes|tbf|honestly|ill|i'll|i have been|i was|i've been).*(cheating|hacking|exploit|using.*mods)/i.test(allText) ||
    /(caught|banned|punished).*(cheating|hacking|exploit)/i.test(allText) ||
    /(i|was).*(using|running|had).*(hacked|cheat|unfair|illegal)/i.test(allText) ||
    /(joined|play|played|download|downloaded|install|installed|tried|got|have).*(?:${escapedClients.join('|')})/i.test(allText);

  const admitsFault = /i (did|was) (wrong|guilty)|i (admit|confess|accept|take responsibility|broke|violated|understand why|understand the reason)|przepraszam|przyznaję|me equivoqué|lo siento|asumo|acepto/i.test(allText);

  const showsRemorse = /sorry|apologize|regret|won't (happen|do)|never (again|do)|przepraszam|ża\u0142uję|lo siento|arrepiento|disculpa/i.test(allText);

  const hasChangePlan = /(will|won't|never|learned|lesson|different|future).*(rule|behavio?r|better|second chance|again|follow)/i.test(allText);

  const denies = /(didn't|did not|would never|wasn't me|false|wrongful|unfair|innocent|mistake).*(ban|punish|action)/i.test(allText);

  const blamesOthers = /(staff|mod|admin|hater|target|singled out|framed|set up|false report|false ban)/i.test(allText);

  const noUnderstanding = /(don't know|don't understand|no idea|not sure|confused|wasn't told|no reason).*(ban|why|reason)/i.test(allText);

  const strongDenial = /(didn't|did not|would never|wasn't me|false|wrongful|unfair|innocent|mistake).*(ban|punish|action)/i.test(allText) && !admitsFault && !admitsCheating;

  // If anticheat confirmed a hack, verdict is automatic
  const anticheatEntry = answers.find(a => a.question === '_anticheat_record');
  if (anticheatEntry) {
    let acData;
    try {
      acData = JSON.parse(anticheatEntry.answer);
    } catch {
      acData = { hackLabel: anticheatEntry.answer, playerName: 'Unknown' };
    }
    return { verdict: 'anticheat_confirmed', ...acData };
  }

  let verdict;
  if (admitsCheating) {
    verdict = 'fair';
  } else if (strongDenial) {
    verdict = 'unfair';
  } else {
    let score = 0;
    if (admitsFault) score += 2;
    if (showsRemorse) score += 2;
    if (hasChangePlan) score += 1;
    if (denies) score -= 1;
    if (blamesOthers) score -= 2;
    if (noUnderstanding) score -= 1;

    if (score >= 3) {
      verdict = 'fair';
    } else if (score <= 0) {
      verdict = 'unfair';
    } else {
      verdict = 'mixed';
    }
  }

  return { verdict, admitsCheating, admitsFault, showsRemorse, hasChangePlan, denies, blamesOthers, noUnderstanding };
}

async function sendAutoHelp(channel, member, type, answers, ticketId, userId) {
  const typeName = getTicketTypeName(type);

  switch (type) {
    case 'ban_appeal': {
      const analysis = analyzeBanAppeal(answers);

      const analysisTitleKey = `auto.ban_analysis.${analysis.verdict}_title`;
      const analysisDescKey = `auto.ban_analysis.${analysis.verdict}_desc`;

      const verdictColors = { fair: 0x57F287, unfair: 0xED4245, mixed: 0xFEE75C, anticheat_confirmed: 0xED4245 };

      const isAcConfirmed = analysis.verdict === 'anticheat_confirmed';
      const verdictFields = [
        {
          name: i18n.t(analysisTitleKey, userId),
          value: i18n.t(analysisDescKey, userId, isAcConfirmed ? { hackLabel: analysis.hackLabel } : {}),
        },
      ];

      if (isAcConfirmed) {
        const bannedAt = analysis.bannedAt ? new Date(analysis.bannedAt).toLocaleString() : 'Unknown';
        const expires = analysis.expiresAt ? new Date(analysis.expiresAt).toLocaleString() : 'Permanent';
        verdictFields.push(
          { name: '👤 Player', value: `\`${analysis.playerName}\``, inline: true },
          { name: '🔍 Detected Hack', value: `\`${analysis.hackLabel}\``, inline: true },
          { name: '🆔 Ban ID', value: `\`${analysis.banId}\``, inline: true },
          { name: '📅 Banned At', value: bannedAt, inline: true },
          { name: '⏳ Expires', value: expires, inline: true },
          { name: '✅ Status', value: analysis.unbanned ? 'Unbanned' : 'Active', inline: true },
        );
      }

      await channel.send({
        embeds: [createEmbed({
          title: i18n.t('auto.ban_analysis.analysis_title', userId),
          description: i18n.t('auto.ban_analysis.analysis_desc', userId),
          color: verdictColors[analysis.verdict] || 0xFEE75C,
          fields: verdictFields,
        })],
      });

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
      return analysis;
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

function extractPlayerName(text) {
  const commonWords = new Set([
    'my','am','is','the','what','why','how','because','i','you','he','she','it','we','they',
    'this','that','these','those','a','an','and','but','or','for','so','yet','with','from','at',
    'by','to','in','of','on','not','no','yes','do','does','did','has','have','had','can','could',
    'will','would','shall','should','may','might','must','was','were','are','been','being','name',
    'ign','minecraft','username','user','discord','id','ban','appeal','please','help','here','there',
    'got','get','was','banned','playing','server','then','than','just','also','very','really',
  ]);

  const cleaned = text.trim();
  // Single word — likely the IGN
  if (!cleaned.includes(' ')) {
    const single = cleaned.match(/^[A-Za-z][A-Za-z0-9_]{2,15}$/);
    if (single) return single[0];
    return null;
  }

  // Pattern: "my ign is X", "ign: X", "X is my ign/name", "username: X", "name: X"
  const patternMatches = cleaned.match(
    /(?:my\s+)?(?:ign|name|username|minecraft\s*name)(?:\s+is|\s*:|:)?\s+([A-Za-z][A-Za-z0-9_]{2,15})\b/i
  );
  if (patternMatches) return patternMatches[1];

  // Fallback: last non-common word matching IGN pattern
  const words = cleaned.match(/\b[A-Za-z][A-Za-z0-9_]{2,15}\b/g);
  if (words) {
    for (let i = words.length - 1; i >= 0; i--) {
      if (!commonWords.has(words[i].toLowerCase())) {
        return words[i];
      }
    }
    return words[words.length - 1];
  }

  return null;
}

function extractUuid(text) {
  // With dashes: 8-4-4-4-12
  const withDashes = text.match(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/);
  if (withDashes) return withDashes[0];
  // Without dashes: 32 hex chars (only if not just a word starting with a-f)
  const withoutDashes = text.match(/\b[0-9a-fA-F]{32}\b/);
  if (withoutDashes) return withoutDashes[0];
  return null;
}

function extractNumericId(text) {
  // Anticheat ban ID (positive integer) — skips Discord-length IDs
  const tokens = text.match(/\b\d{1,16}\b/g);
  if (!tokens) return null;
  for (const token of tokens) {
    const n = parseInt(token, 10);
    if (!isNaN(n) && n > 0) return token;
  }
  return null;
}

function extractBanStringId(text) {
  // Format: CS-C4A5BC69-19F0E9FE556-1  (prefix-hex-hex-counter)
  const match = text.match(/\b[A-Z]{2}-[A-Z0-9]+-[A-Z0-9]+-\d+\b/);
  return match ? match[0] : null;
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

async function closeAndDeleteTicket(channel, ticketId, userId) {
  try {
    await channel.send({
      embeds: [createEmbed({
        title: i18n.t('auto.question.time_expired_title', userId),
        description: i18n.t('auto.question.time_expired_desc', userId),
        color: config.embed.color.warning,
      })],
    });

    await new Promise((r) => setTimeout(r, 3000));

    const { run } = getDb();
    run(`UPDATE tickets SET status = 'deleted' WHERE ticket_id = ?`, [ticketId]);

    await logTicketAction(channel.guild, 'Ticket auto-deleted (inactivity)', {
      ticketId,
      channel,
    });

    await channel.delete();
  } catch (error) {
    logger.error('Error auto-closing ticket:', error);
  }
}

async function autoCloseTicket(channel, ticketId, userId) {
  try {
    const html = await generateTranscript(channel, ticketId);

    const transcriptDir = path.join(__dirname, '../../transcripts');
    if (!fs.existsSync(transcriptDir)) {
      fs.mkdirSync(transcriptDir, { recursive: true });
    }
    const filePath = path.join(transcriptDir, `${ticketId}.html`);
    fs.writeFileSync(filePath, html);

    const logChannel = channel.guild.channels.cache.get(config.ticket.logChannelId);
    if (logChannel) {
      await logChannel.send({
        embeds: [createEmbed({
          title: '📄 Ban Appeal — Auto-Closed (Denied)',
          description: `Ticket \`${ticketId}\` by <@${userId}> was automatically closed after the appeal was denied.`,
          color: config.embed.color.error,
          timestamp: new Date(),
        })],
        files: [filePath],
      });
    }

    const { run } = getDb();
    run(`UPDATE tickets SET status = 'deleted' WHERE ticket_id = ?`, [ticketId]);

    await channel.delete();
  } catch (error) {
    logger.error('Error auto-closing ticket after denied verdict:', error);
  }
}

async function logTicketAction(guild, action, data) {
  const logChannel = guild.channels.cache.get(config.ticket.logChannelId);
  if (!logChannel) return;
  await logChannel.send({
    embeds: [createEmbed({
      title: `${config.emoji.ticket} ${action}`,
      fields: [
        { name: 'Ticket', value: `\`${data.ticketId}\``, inline: true },
        ...(data.channel ? [{ name: 'Channel', value: `${data.channel}`, inline: true }] : []),
      ],
      color: config.embed.color.warning,
      timestamp: new Date(),
    })],
  });
}

module.exports = {
  startAutoResponse,
};
