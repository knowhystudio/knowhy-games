// Static i18n consistency check for the whole site (no build system required).
// Usage: node scripts/check-i18n.mjs
// Exits non-zero when any locale catalog or page binding is inconsistent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SUPPORTED_LOCALES, translations } from '../locale.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  'index.html',
  'classroom-snacks/index.html',
  'find-hidden-object/index.html',
  'plant-jigsaw/index.html',
  'plant-memory-flip/index.html',
  'plant-nonogram/index.html',
  'plant-coloring/index.html',
];
const problems = [];
const note = (msg) => problems.push(msg);

// 1. Every locale exposes exactly the same key set as English, with non-empty strings.
const englishKeys = Object.keys(translations.en).sort();
for (const locale of SUPPORTED_LOCALES) {
  const keys = Object.keys(translations[locale]);
  const missing = englishKeys.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !englishKeys.includes(key));
  if (missing.length) note(`${locale}: missing keys ${missing.join(', ')}`);
  if (extra.length) note(`${locale}: extra keys ${extra.join(', ')}`);
  for (const key of englishKeys) {
    const value = translations[locale][key];
    if (typeof value !== 'string' || !value.trim()) note(`${locale}:${key} is empty`);
  }
}

// 2. Placeholder tokens ({count}) must agree across locales.
for (const key of englishKeys) {
  const tokens = (translations.en[key].match(/\{(\w+)\}/g) ?? []).sort().join(',');
  for (const locale of SUPPORTED_LOCALES) {
    if (locale === 'en') continue;
    const other = (translations[locale][key].match(/\{(\w+)\}/g) ?? []).sort().join(',');
    if (tokens !== other) note(`${locale}:${key} placeholders {${other}} != en {${tokens}}`);
  }
}

// 3. Every i18n binding used by any page must exist in every locale catalog.
const bindingRe = /data-i18n(?:-aria|-alt)?="([^"]+)"/g;
const usedKeys = new Set();
for (const page of pages) {
  const html = readFileSync(join(root, page), 'utf8');
  for (const match of html.matchAll(bindingRe)) {
    usedKeys.add(match[1]);
    if (!(match[1] in translations.en)) note(`${page}: binding "${match[1]}" missing from catalog`);
  }
  // The language selector must offer exactly the supported locale set.
  const options = [...html.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  const expected = [...SUPPORTED_LOCALES];
  if (options.join('|') !== expected.join('|')) note(`${page}: language options ${options.join(',')} != ${expected.join(',')}`);
  // Meta title/description keys, when declared, must exist.
  for (const attr of ['titleKey', 'descKey']) {
    const declared = html.match(new RegExp(`data-${attr.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="([^"]+)"`));
    if (declared && !(declared[1] in translations.en)) note(`${page}: data-${attr} "${declared[1]}" missing from catalog`);
  }
}
for (const locale of SUPPORTED_LOCALES) {
  for (const key of usedKeys) {
    if (!(key in translations[locale])) note(`${locale}: page key "${key}" missing`);
  }
}

// 4. Retired keys must not come back, and the "All games" wording is unified via navAll only.
for (const locale of SUPPORTED_LOCALES) {
  if ('footerAll' in translations[locale]) note(`${locale}: retired key "footerAll" is back (use navAll)`);
}
for (const page of pages) {
  const html = readFileSync(join(root, page), 'utf8');
  if (html.includes('data-i18n="footerAll"')) note(`${page}: still binds footerAll (use navAll)`);
}

if (problems.length) {
  console.error(`i18n check FAILED (${problems.length} problem${problems.length === 1 ? '' : 's'}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`i18n check OK: ${SUPPORTED_LOCALES.length} locales × ${englishKeys.length} keys, ${usedKeys.size} distinct page bindings across ${pages.length} pages.`);
