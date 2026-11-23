// Wires the page together. Buttons declare what they do with data-action="...".

import { SETTINGS, WEDDING } from "./config.js";
import { state, clearPhoto } from "./state.js";
import * as ui from "./ui.js";
import { clearDraft, loadDraft, saveDraft } from "./storage.js";
import * as camera from "./camera.js";
import { processFile, toResizedJpeg, loadImage } from "./photo.js";
import { requestCaricature } from "./api.js";
import { composePortrait, waitForFonts } from "./portrait/compose.js";
import { canShareFiles, downloadPortrait, sharePortrait } from "./share.js";

const { $ } = ui;

function goToStep(n) {
  ui.goToStep(n);
  saveDraft({ step: n });
}

/* ---------- Photo ---------- */

function setPhoto({ dataUrl, base64 }) {
  state.photoBase64 = base64;
  ui.showPhotoPreview(dataUrl);
}

function takePhoto() {
  ui.hideError();
  saveDraft({ step: 2 });
  // Must stay synchronous so the browser treats it as part of the tap.
  if (camera.isTouchDevice() || !camera.canUseLiveCamera()) {
    camera.openNativeCamera();
    return;
  }
  camera.openLiveCamera().catch((err) => {
    console.warn("Live camera unavailable:", err);
    camera.closeLiveCamera();
    ui.showError("We couldn't open your camera. Please allow camera access in your browser, or tap 'Choose Photo' to upload one.");
  });
}

function capturePhoto() {
  try {
    const frame = camera.captureFrame();
    camera.closeLiveCamera();
    setPhoto(toResizedJpeg(frame));
  } catch (err) {
    camera.closeLiveCamera();
    ui.showError(err.message);
  }
}

async function onFileChosen(event) {
  const file = event.target.files[0];
  event.target.value = ""; // allow picking the same file again
  if (!file) return;

  ui.hideError();
  goToStep(2);
  ui.setPhotoProcessing(true);
  try {
    setPhoto(await processFile(file));
  } catch (err) {
    console.error(err);
    ui.showError(err.message || "We couldn't read that photo. Please try a different one.");
  } finally {
    ui.setPhotoProcessing(false);
  }
}

/* ---------- Generation ---------- */

async function onSubmit(event) {
  event.preventDefault();
  ui.hideError();

  const name = $("guestName").value.trim();
  const message = $("guestMessage").value.trim();
  if (!name) return ui.showError("Please enter your name.");
  if (!state.photoBase64) return ui.showError("Please take or choose a photo first.");

  state.guestName = name;
  state.guestMessage = message || WEDDING.defaultMessage;
  await generate();
}

async function generate() {
  if (state.busy || !state.photoBase64) return;
  state.busy = true;
  goToStep(3);
  const stopProgress = ui.startProgress(SETTINGS.progressMessages, SETTINGS.progressIntervalMs);

  try {
    const imageUrl = await requestCaricature(state.photoBase64);
    const image = await loadImage(imageUrl);
    await waitForFonts();
    composePortrait($("portraitCanvas"), { image, guestName: state.guestName, message: state.guestMessage });
    goToStep(4);
    $("shareBtn").classList.toggle("hidden", !(await canShareFiles($("portraitCanvas"), state.guestName)));
  } catch (err) {
    console.error("Generation failed:", err);
    goToStep(2);
    ui.showError(err.message || "Something went wrong painting your portrait. Please try again.");
  } finally {
    stopProgress();
    state.busy = false;
  }
}

/* ---------- Reset ---------- */

function resetApp() {
  clearPhoto();
  $("detailsForm").reset();
  ui.clearPhotoPreview();
  ui.hideError();
  clearDraft();
  ui.updateCharCounter(SETTINGS.maxMessageLength);
  goToStep(1);
}

/* ---------- Wiring ---------- */

const actions = {
  begin: () => goToStep(2),
  "take-photo": takePhoto,
  "choose-photo": () => $("fileInput").click(),
  "close-camera": () => camera.closeLiveCamera(),
  "flip-camera": () => camera.flipCamera().catch((e) => ui.showError(e.message)),
  capture: capturePhoto,
  share: () => sharePortrait($("portraitCanvas"), state.guestName),
  download: () => downloadPortrait($("portraitCanvas"), state.guestName),
  regenerate: generate,
  reset: resetApp,
};

function init() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = actions[el.dataset.action];
    if (action) {
      e.preventDefault();
      action();
    }
  });

  $("fileInput").addEventListener("change", onFileChosen);
  $("nativeCameraInput").addEventListener("change", onFileChosen);
  $("detailsForm").addEventListener("submit", onSubmit);

  const nameEl = $("guestName");
  const msgEl = $("guestMessage");
  msgEl.maxLength = SETTINGS.maxMessageLength;
  nameEl.addEventListener("input", () => saveDraft({ name: nameEl.value }));
  msgEl.addEventListener("input", () => {
    ui.updateCharCounter(SETTINGS.maxMessageLength);
    saveDraft({ message: msgEl.value });
  });

  ui.renderSuggestionChips(WEDDING.presetMessages, (msg) => {
    msgEl.value = msg;
    ui.updateCharCounter(SETTINGS.maxMessageLength);
    saveDraft({ message: msg });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") camera.closeLiveCamera();
  });

  const draft = loadDraft();
  nameEl.value = draft.name;
  msgEl.value = draft.message;
  ui.updateCharCounter(SETTINGS.maxMessageLength);
  // The photo isn't kept between reloads, so only ever resume at the details step.
  if (draft.step >= 2) ui.goToStep(2);
}

init();
