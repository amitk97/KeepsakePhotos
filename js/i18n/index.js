// Language switching. In the HTML:
//   data-i18n="key"             → element text
//   data-i18n-placeholder="key" → placeholder
//   data-i18n-aria="key"        → aria-label

import { LANGUAGES, STRINGS } from "./strings.js";

const STORAGE_KEY = "pa_wedding_lang";
const CODES = LANGUAGES.map((l) => l.code);
const listeners = new Set();

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (CODES.includes(saved)) return saved;
  } catch {
    // storage blocked
  }
  const browser = (navigator.language || "en").slice(0, 2).toLowerCase();
  return CODES.includes(browser) ? browser : "en";
}

let current = initialLang();
// Wording the hosts changed on the admin page, e.g. { en: { venueLine: "…", presets: [...] } }.
let overrides = {};

export function setOverrides(next) {
  overrides = next || {};
}

export function getLang() {
  return current;
}

// t("queue", 3, 1) → text. Falls back to English if a key is missing.
export function t(key, ...args) {
  const value = overrides[current]?.[key] ?? STRINGS[current]?.[key] ?? overrides.en?.[key] ?? STRINGS.en[key];
  if (typeof value === "function") return value(...args);
  return value ?? key;
}

export function applyTranslations(root = document) {
  document.documentElement.lang = current === "en" ? "en-GB" : current;
  root.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  root.querySelectorAll("[data-lang]").forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.lang === current)));
}

export function setLang(code) {
  if (!CODES.includes(code) || code === current) return;
  current = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // storage blocked
  }
  applyTranslations();
  listeners.forEach((fn) => fn(code));
}

export function onLangChange(fn) {
  listeners.add(fn);
}
