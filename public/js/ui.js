// DOM helpers: steps, errors, photo preview, progress text.

import { t } from "./i18n/index.js";

export const $ = (id) => document.getElementById(id);

const STEPS = ["step1", "step2", "step3", "step4"];

export function goToStep(n) {
  STEPS.forEach((id, i) => $(id).classList.toggle("hidden", i !== n - 1));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function currentStep() {
  return STEPS.findIndex((id) => !$(id).classList.contains("hidden")) + 1;
}

export function showError(message) {
  $("uploadErrorText").textContent = message;
  $("uploadError").classList.remove("hidden");
  $("uploadError").scrollIntoView({ behavior: "smooth", block: "center" });
}

export function hideError() {
  $("uploadError").classList.add("hidden");
}

export function setPhotoProcessing(on) {
  $("photoProcessing").classList.toggle("hidden", !on);
}

export function showPhotoPreview(dataUrl) {
  $("photoPreviewImg").src = dataUrl;
  $("photoPreviewContainer").classList.remove("hidden");
  $("photoSelectionButtons").classList.add("hidden");
  $("submitBtn").disabled = false;
}

export function clearPhotoPreview() {
  $("photoPreviewImg").removeAttribute("src");
  $("photoPreviewContainer").classList.add("hidden");
  $("photoSelectionButtons").classList.remove("hidden");
  $("submitBtn").disabled = true;
}

export function updateCharCounter(max) {
  $("charCounter").textContent = `${$("guestMessage").value.length} / ${max}`;
}

export function renderSuggestionChips(messages, onPick) {
  const container = $("suggestionChips");
  container.replaceChildren(
    ...messages.map((msg) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = msg;
      chip.addEventListener("click", () => onPick(msg));
      return chip;
    })
  );
}

// Cycles through progress messages; returns a stop function.
export function startProgress(messages, intervalMs) {
  const el = $("processingSubtitle");
  let i = 0;
  el.textContent = messages[0];
  const timer = setInterval(() => {
    i = Math.min(i + 1, messages.length - 1);
    el.textContent = messages[i];
  }, intervalMs);
  return () => clearInterval(timer);
}

// Shows "You're 3rd in line, about 1 minute" while waiting; hides it once painting starts.
export function showQueuePosition(position, secondsEach) {
  const el = $("queueStatus");
  if (!(position > 0)) {
    el.classList.add("hidden");
    return;
  }
  const mins = Math.max(1, Math.round((position * secondsEach) / 60));
  el.textContent = t("queue", position, mins);
  el.classList.remove("hidden");
}

export function setQuickNote(on) {
  $("quickNote").classList.toggle("hidden", !on);
}
