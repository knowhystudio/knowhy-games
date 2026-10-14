import { SUPPORTED_LOCALES, resolveLocale, translate } from './locale.js';

const storageKey = 'knowhy.games.language';
const listeners = new Set();
let saved = null;
try { saved = localStorage.getItem(storageKey); } catch { /* Private storage may be unavailable. */ }
let locale = resolveLocale(saved);

export function getLocale() { return locale; }
export function t(key, params) { return translate(locale, key, params); }
export function onLocaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function applyLocale() {
  document.documentElement.lang = locale;
  document.documentElement.dataset.localeReady = 'true';
  const titleKey = document.body.dataset.titleKey || (document.body.dataset.page === 'detail' ? 'detailTitleMeta' : 'homeTitleMeta');
  const descKey = document.body.dataset.descKey || (document.body.dataset.page === 'detail' ? 'detailDescriptionMeta' : 'homeDescriptionMeta');
  document.title = t(titleKey);
  document.querySelector('meta[name="description"]')?.setAttribute('content', t(descKey));
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((node) => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-alt]').forEach((node) => { node.setAttribute('alt', t(node.dataset.i18nAlt)); });
  document.querySelectorAll('img[data-loc-base]').forEach((node) => {
    const target = node.dataset.locBase + '/' + locale + '.png';
    if (node.getAttribute('src') === target) return;
    node.onerror = () => { node.onerror = null; node.src = node.dataset.locBase + '/en.png'; };
    node.src = target;
  });
  document.querySelectorAll('[data-language-select]').forEach((node) => { node.value = locale; });
}

export function setLocale(nextLocale) {
  if (!SUPPORTED_LOCALES.includes(nextLocale) || nextLocale === locale) return;
  locale = nextLocale;
  try { localStorage.setItem(storageKey, locale); } catch { /* Keep this page usable without storage. */ }
  applyLocale();
  listeners.forEach((listener) => listener(locale));
}

document.querySelectorAll('[data-language-select]').forEach((node) => {
  node.addEventListener('change', (event) => setLocale(event.target.value));
});
applyLocale();
