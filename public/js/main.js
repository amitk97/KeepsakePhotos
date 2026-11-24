// Wires the page together. Buttons declare what they do with data-action="...".

import { SETTINGS, WEDDING } from "./config.js";
import { state, clearPhoto } from "./state.js";
import * as ui from "./ui.js";
import { clearDraft, loadDraft, saveDraft } from "./storage.js";
import * as camera from "./camera.js";
import { processFile, preparePhoto, loadImage } from "./photo.js";
import { fetchQueuePosition, newRequestId, requestCaricature } from "./api.js";
import { watercolorize } from "./sketch/watercolor.js";
import { composePortrait, waitForFonts } from "./portrait/compose.js";
import { canShareFiles, downloadPortrait, sharePortrait } from "./share.js";

const { $ } = ui;

function goToStep(n) {
  ui.goToStep(n);
  saveDraft({ step: n });
}

/* ---------- Photo ---------- */

function setPhoto({ dataUrl, base64, smallBase64 }) {
  state.photoBase64 = base64;
  state.smallPhotoBase64 = smallBase64;
  state.photoDataUrl = dataUrl;
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
    setPhoto(preparePhoto(frame));
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

// Free, offline watercolour painted on the guest's phone when no AI artist is available.
async function paintOnPhone() {
  const photo = await loadImage(state.photoDataUrl);
  return watercolorize(photo);
}

async function generate() {
  if (state.busy || !state.photoBase64) return;
  state.busy = true;
  goToStep(3);
  ui.setQuickNote(false);
  const stopProgress = ui.startProgress(SETTINGS.progressMessages, SETTINGS.progressIntervalMs);

  const requestId = newRequestId();
  const poll = setInterval(async () => {
    const { position } = await fetchQueuePosition(requestId);
    ui.showQueuePosition(position, SETTINGS.secondsPerPortrait);
  }, SETTINGS.queuePollMs);

  try {
    let image;
    let quick = false;
    try {
      const { image: url } = await requestCaricature({
        photoBase64: state.photoBase64,
        smallPhotoBase64: state.smallPhotoBase64,
        requestId,
      });
      image = await loadImage(url);
    } catch (err) {
      if (!err.useFilter) throw err;
      console.warn("Using on-phone watercolour:", err.message);
      image = await paintOnPhone();
      quick = true;
    }
    await waitForFonts();
    composePortrait($("portraitCanvas"), { image, guestName: state.guestName, message: state.guestMessage });
    ui.setQuickNote(quick);
    goToStep(4);
    $("shareBtn").classList.toggle("hidden", !(await canShareFiles($("portraitCanvas"), state.guestName)));
  } catch (err) {
    console.error("Generation failed:", err);
    goToStep(2);
    ui.showError(err.message || "Something went wrong painting your portrait. Please try again.");
  } finally {
    clearInterval(poll);
    ui.showQueuePosition(-1);
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
