// The background colour dots on the details step. The choice goes into the AI's instructions.

import { BACKGROUNDS, DEFAULT_BACKGROUND } from "../ai/styles.js";
import { onLangChange, t } from "../i18n/index.js";
import { state } from "../state.js";

function renderInto(box) {
  box.replaceChildren(
    ...BACKGROUNDS.map((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch";
      btn.style.setProperty("--swatch", b.swatch);
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", String(state.background === b.id));
      btn.setAttribute("aria-label", t(`bg_${b.id}`));
      btn.title = t(`bg_${b.id}`);
      btn.addEventListener("click", () => {
        state.background = b.id;
        render();
        box.dispatchEvent(new CustomEvent("background-change", { bubbles: true }));
      });
      return btn;
    })
  );
}

// Every colour row on the page (details step and result step) shows the same choice.
function render() {
  for (const box of document.querySelectorAll(".swatches")) renderInto(box);
  for (const el of document.querySelectorAll(".background-name")) el.textContent = t(`bg_${state.background}`);
}

export function initBackgrounds() {
  state.background = state.background || DEFAULT_BACKGROUND;
  render();
  onLangChange(render);
}
