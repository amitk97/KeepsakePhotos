// The language buttons. Once a guest has picked a language, they shrink to one small
// "🌐 English" button; tapping it shows all three again.

import { hasChosenLang, onLangChange, setLang } from "../i18n/index.js";
import { $ } from "./dom.js";

function setCollapsed(on) {
  const nav = $("langSwitch");
  nav.classList.toggle("collapsed", on);
  $("langToggle").setAttribute("aria-expanded", String(!on));
}

function updateToggleLabel() {
  const current = document.querySelector('#langSwitch [data-lang][aria-pressed="true"]');
  $("langCurrent").textContent = current ? current.textContent : "";
}

export function chooseLang(el) {
  setLang(el.dataset.lang);
  updateToggleLabel();
  setCollapsed(true);
}

export function toggleLangs() {
  setCollapsed(!$("langSwitch").classList.contains("collapsed"));
}

export function initLangSwitch() {
  updateToggleLabel();
  onLangChange(updateToggleLabel);
  setCollapsed(hasChosenLang());
}
