// DOM helpers: steps, errors, photo preview, progress text.

import { t } from "../i18n/index.js";

export const $ = (id) => document.getElementById(id);

const STEPS = ["step1", "step2", "step3", "step4"];

// focus: move keyboard and screen-reader focus to the new step's heading, so it's announced.
export function goToStep(n, { focus = true } = {}) {
  STEPS.forEach((id, i) => $(id).classList.toggle("hidden", i !== n - 1));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  if (focus) $(STEPS[n - 1]).querySelector("h2")?.focus({ preventScroll: true });
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
  $("photoDropZone").classList.add("hidden");
  $("submitBtn").disabled = false;
}

export function clearPhotoPreview() {
  $("photoPreviewImg").removeAttribute("src");
  $("photoPreviewContainer").classList.add("hidden");
  $("photoDropZone").classList.remove("hidden");
  $("submitBtn").disabled = true;
}

export function updateCharCounter(max) {
  const used = $("guestMessage").value.length;
  $("charCounter").textContent = `${used} / ${max}`;
  $("charCounterSr").textContent = t("charsLeft", max - used);
}

// Marks a field as wrong for screen readers and puts the cursor in it.
export function flagField(id) {
  const el = $(id);
  el.setAttribute("aria-invalid", "true");
  el.setAttribute("aria-errormessage", "uploadErrorText");
  el.focus();
  el.addEventListener("input", () => el.removeAttribute("aria-invalid"), { once: true });
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

// A line under the progress message, e.g. place in line or "Asking another artist".
export function showStatus(text) {
  const el = $("queueStatus");
  el.textContent = text || "";
  el.classList.toggle("hidden", !text);
}

// Gentle tips under the photo preview (too dark, blurry, no face). Empty list hides them.
export function showPhotoWarnings(messages) {
  const box = $("photoWarnings");
  box.replaceChildren(...messages.map((m) => Object.assign(document.createElement("li"), { textContent: m })));
  box.classList.toggle("hidden", messages.length === 0);
}
