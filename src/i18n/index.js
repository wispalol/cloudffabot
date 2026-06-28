const en = require('./en');
const pl = require('./pl');
const es = require('./es');

const locales = { en, pl, es };
const userLocales = new Map();
let dbRef = null;

function init(getDbFn) {
  try {
    const { get, all } = getDbFn();
    const rows = all('SELECT user_id, locale FROM user_locales');
    for (const row of rows) {
      if (locales[row.locale]) {
        userLocales.set(row.user_id, row.locale);
      }
    }
    dbRef = getDbFn;
  } catch {
    // DB not ready yet
  }
}

function setUserLocale(userId, locale) {
  if (!locales[locale]) return false;
  userLocales.set(userId, locale);
  if (dbRef) {
    try {
      const { run } = dbRef();
      run(
        `INSERT INTO user_locales (user_id, locale, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET locale = excluded.locale, updated_at = datetime('now')`,
        [userId, locale]
      );
    } catch {
      // DB unavailable
    }
  }
  return true;
}

function getUserLocale(userId) {
  if (userId && userLocales.has(userId)) return userLocales.get(userId);
  return process.env.LANGUAGE || 'en';
}

function getAvailableLocales() {
  return Object.keys(locales);
}

function getLocaleInfo() {
  return Object.entries(locales).map(([code, data]) => ({
    code,
    name: data._name,
    flag: data._flag,
  }));
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
  getLocaleInfo,
  getQuestions,
  getQuestionCount,
  init,
  locales,
};
