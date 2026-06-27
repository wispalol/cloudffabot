const en = require('./en');
const pl = require('./pl');
const es = require('./es');

const locales = { en, pl, es };
const userLocales = new Map();

function setUserLocale(userId, locale) {
  if (locales[locale]) {
    userLocales.set(userId, locale);
  }
}

function getUserLocale(userId) {
  if (userId && userLocales.has(userId)) return userLocales.get(userId);
  return process.env.LANGUAGE || 'en';
}

function getAvailableLocales() {
  return Object.keys(locales);
}

function getQuestions(type, userId = null) {
  const localeCode = getUserLocale(userId);
  const locale = locales[localeCode] || locales.en;
  return (locale.questions && locale.questions[type]) || locales.en.questions[type] || [];
}

function getQuestionCount(type, userId = null) {
  return getQuestions(type, userId).length;
}

function t(key, userId = null, replacements = {}) {
  const localeCode = getUserLocale(userId);
  const locale = locales[localeCode] || locales.en;
  const parts = key.split('.');
  let value = locale;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return key;
    }
  }
  if (typeof value !== 'string') return key;
  for (const [k, v] of Object.entries(replacements)) {
    value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return value;
}

module.exports = {
  t,
  setUserLocale,
  getUserLocale,
  getAvailableLocales,
  getQuestions,
  getQuestionCount,
  locales,
};
