// "A+" button for easier reading: makes all text and buttons about 20% larger.
// The choice is remembered on that phone.

import { $ } from "./dom.js";

const KEY = "pa_big_text";

function apply(on) {
  document.documentElement.classList.toggle("big-text", on);
  $("bigTextBtn").setAttribute("aria-pressed", String(on));
}

export function toggleBigText() {
  const on = !document.documentElement.classList.contains("big-text");
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
}
