// The background colour dots on the details step. The choice goes into the AI's instructions.

import { BACKGROUNDS, DEFAULT_BACKGROUND } from "../ai/styles.js";
import { onLangChange, t } from "../i18n/index.js";
import { state } from "../state.js";
import { $ } from "./dom.js";

function render() {
  const box = $("backgroundChoices");
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
      });
      return btn;
    })
  );
  $("backgroundName").textContent = t(`bg_${state.background}`);
}

export function initBackgrounds() {
  state.background = state.background || DEFAULT_BACKGROUND;
  render();
  onLangChange(render);
}
