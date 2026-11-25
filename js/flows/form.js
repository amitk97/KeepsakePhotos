// The details form: name, message, suggestion chips, saved drafts, submit and start over.

import { SETTINGS } from "../config.js";
import { onLangChange, t } from "../i18n/index.js";
import { clearPhoto, state } from "../state.js";
import * as ui from "../ui/dom.js";
import { hideCompare } from "../ui/compare.js";
import { clearDraft, loadDraft, saveDraft } from "../services/drafts.js";
import { goToStep } from "./navigation.js";
import { makePortrait } from "./portrait.js";

const { $ } = ui;
const counter = () => ui.updateCharCounter(SETTINGS.maxMessageLength);

export function renderChips() {
  ui.renderSuggestionChips(t("presets"), (msg) => {
    $("guestMessage").value = msg;
    counter();
    saveDraft({ message: msg });
  });
}

async function onSubmit(event) {
  event.preventDefault();
  ui.hideError();
  const name = $("guestName").value.trim();
  const message = $("guestMessage").value.trim();
  if (!name) {
    ui.showError(t("errName"));
    return ui.flagField("guestName");
  }
  if (!state.photoBase64) {
    ui.showError(t("errPhoto"));
    return ui.nudge($("photoDropZone"));
  }

  state.guestName = name;
  state.guestMessage = message || t("defaultMessage");
  await makePortrait();
}

export function resetApp() {
  clearPhoto();
  $("detailsForm").reset();
  ui.clearPhotoPreview();
  ui.hideError();
  hideCompare();
  clearDraft();
  counter();
  goToStep(1);
}

export function initForm() {
  const nameEl = $("guestName");
  const msgEl = $("guestMessage");
  msgEl.maxLength = SETTINGS.maxMessageLength;

  $("detailsForm").addEventListener("submit", onSubmit);
  nameEl.addEventListener("input", () => saveDraft({ name: nameEl.value }));
  msgEl.addEventListener("input", () => {
    counter();
    saveDraft({ message: msgEl.value });
  });

  renderChips();
  onLangChange(() => {
    renderChips();
    counter();
  });

  // Bring back the name and message if the page reloaded (e.g. after the phone's camera app).
  const draft = loadDraft();
  nameEl.value = draft.name;
  msgEl.value = draft.message;
  counter();
  if (draft.step >= 2) ui.goToStep(2, { focus: false }); // the photo isn't kept, so resume at details
}
