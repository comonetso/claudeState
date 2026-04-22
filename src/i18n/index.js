const ko = require('./ko.json');
const en = require('./en.json');

const dicts = { ko, en };
let current = 'ko';

function setLanguage(lang) {
  current = lang === 'en' ? 'en' : 'ko';
  return current;
}

function getLanguage() {
  return current;
}

function t(key, ...args) {
  const dict = dicts[current] || dicts.ko;
  let value = dict[key];
  if (value == null) value = dicts.ko[key];
  if (value == null) return key;
  if (typeof value === 'string' && args.length) {
    value = value.replace(/\{(\d+)\}/g, (_, i) => {
      const v = args[Number(i)];
      return v == null ? '' : String(v);
    });
  }
  return value;
}

function getDict() {
  return dicts[current] || dicts.ko;
}

module.exports = { t, setLanguage, getLanguage, getDict };
