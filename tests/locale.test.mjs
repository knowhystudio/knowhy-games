import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SUPPORTED_LOCALES, translations, resolveLocale, translate } from '../locale.js';

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const allPages = [
  'index.html',
  'classroom-snacks/index.html',
  'find-hidden-object/index.html',
  'plant-jigsaw/index.html',
  'plant-memory-flip/index.html',
  'plant-nonogram/index.html',
  'plant-coloring/index.html',
].map((relative) => join(siteRoot, relative));
const decodeHtml = (value) => value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');

test('the site has the same complete locale catalogs as the game', () => {
  assert.deepEqual(SUPPORTED_LOCALES, ['zh-CN', 'en', 'ja', 'ko', 'es', 'pt-BR', 'fr', 'de', 'ru', 'th', 'vi', 'id', 'tr', 'pl']);
  const englishKeys = Object.keys(translations.en).sort();
  assert.ok(englishKeys.length >= 45);
  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(Object.keys(translations[locale]).sort(), englishKeys, locale);
    for (const key of englishKeys) assert.ok(translations[locale][key].trim(), `${locale}:${key}`);
    assert.match(translations[locale].boardCount, /\{count\}/, locale);
  }
});

test('saved language wins; a first visit always starts in English', () => {
  assert.equal(resolveLocale('de', 'zh-CN'), 'de');
  assert.equal(resolveLocale(null, 'pt-PT'), 'en');
  assert.equal(resolveLocale(null, 'zh-TW'), 'en');
  assert.equal(resolveLocale(null, 'it-IT'), 'en');
  assert.equal(resolveLocale('bad-value', 'ja-JP'), 'en');
});

test('catalog copy translates without losing the English fallback', () => {
  assert.equal(translate('en', 'gamesTitle'), 'Explore the collection');
  assert.equal(translate('unknown', 'gamesTitle'), 'Explore the collection');
  assert.equal(translate('zh-CN', 'gamesTitle'), '探索游戏目录');
});

test('every public page binds its visible copy to known translation keys', () => {
  for (const path of allPages) {
    const keys = [...readFileSync(path, 'utf8').matchAll(/data-i18n(?:-aria|-alt)?="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(keys.length >= 20, `${path}: only ${keys.length} localized bindings`);
    for (const key of keys) assert.ok(translations.en[key], `${path}: unknown page key: ${key}`);
    assert.doesNotMatch(readFileSync(path, 'utf8'), /leaderboard\.js|id="leaderboard"|href="#leaderboard"/, path);
  }
  const home = readFileSync(allPages[0], 'utf8');
  assert.doesNotMatch(home, /class="hero-art"|class="game game-feature"/);
  assert.match(home, /class="game-card"/);
});

test('the language control and footer wording are unified site-wide', () => {
  for (const path of allPages) {
    const html = readFileSync(path, 'utf8');
    assert.match(html, /<span class="language-label" data-i18n="navLanguage">/, `${path}: language label binding`);
    assert.doesNotMatch(html, /data-i18n="footerAll"/, `${path}: footer must use navAll, not the retired footerAll`);
    assert.match(html, /data-i18n="footerBack"/, `${path}: footer back-to-KNOWHY link`);
    if (path !== allPages[0]) {
      assert.match(html, /data-i18n="footerFamily"/, `${path}: footer family row`);
      assert.match(html, /id="daynight"/, `${path}: header theme button`);
    }
  }
});

test('platform status rows are fully localized on every game page', () => {
  for (const path of allPages.slice(1)) {
    const html = readFileSync(path, 'utf8');
    for (const li of html.matchAll(/<li><strong[^>]*>([^<]*)<\/strong><span([^>]*)>/g)) {
      assert.match(li[2], /data-i18n="/, `${path}: platform row "${li[1]}" status text must be localized`);
    }
  }
  const classroom = readFileSync(allPages[1], 'utf8');
  assert.match(classroom, /data-i18n="itchStatus"/, 'classroom-snacks keeps its own itch.io status');
  for (const path of allPages.slice(2)) {
    const html = readFileSync(path, 'utf8');
    assert.match(html, /data-i18n="itchLiveStatus"/, `${path}: browser-live games must use itchLiveStatus`);
    assert.match(html, /data-i18n="portalsOther"|data-i18n="portalsOtherNote"/, `${path}: other-portals row must be localized`);
  }
});

test('static page copy starts in English before localization runs', () => {
  for (const path of [allPages[0], allPages[1]]) {
    const html = readFileSync(path, 'utf8');
    for (const match of html.matchAll(/<([a-z][\w-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>([^<]*)<\/\1>/gi)) {
      assert.equal(decodeHtml(match[3]), translations.en[match[2]], `${path}:${match[2]}`);
    }
  }
});

test('game detail offers both verified play platforms in every locale', () => {
  const detail = readFileSync(allPages[1], 'utf8');
  assert.match(detail, /https:\/\/knowhy\.itch\.io\/classroom-snacks/);
  assert.match(detail, /https:\/\/playgama\.ai\/play\/3tqjeyv6y7/);
  assert.match(detail, /data-i18n="detailPlayPlaygama"/);
  for (const locale of SUPPORTED_LOCALES) {
    assert.match(translations[locale].detailPlayPlaygama, /Playgama/i, locale);
  }
});
