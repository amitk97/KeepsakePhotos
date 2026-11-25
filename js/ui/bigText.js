// "A+" button for easier reading: makes all text and buttons about 20% larger.
// The choice is remembered on that phone.

import { onLangChange, t } from "../i18n/index.js";
import { $ } from "./dom.js";

const KEY = "pa_big_text";

// The button shows what it will do next: "A+" for larger text, "A−" to go back.
function apply(on) {
  document.documentElement.classList.toggle("big-text", on);
  const btn = $("bigTextBtn");
  btn.textContent = on ? "A−" : "A+";
  btn.setAttribute("aria-label", t(on ? "smallText" : "bigText"));
}

const isOn = () => document.documentElement.classList.contains("big-text");

export function toggleBigText() {
  const on = !isOn();
  apply(on);
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // storage blocked
  }
}

export function initBigText() {
  let on = false;
  try {
    on = localStorage.getItem(KEY) === "1";
  } catch {
    // storage blocked
  }
  apply(on);
  onLangChange(() => apply(isOn()));
}
