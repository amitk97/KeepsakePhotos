// Wires the page together. Buttons declare what they do with data-action="...".

import { SETTINGS } from "./config.js";
import { applyTranslations, onLangChange, setLang, t } from "./i18n/index.js";
import { hideCompare, initCompare, showCompare } from "./compare.js";
import { getDesign, loadDesign } from "./design.js";
import { loadSiteSettings, sendKeepsakeToHosts } from "./settings.js";
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
    ui.showError(t("errCamera"));
  });
}

function capturePhoto() {
  try {
    const frame = camera.captureFrame();
    camera.closeLiveCamera();
    setPhoto(preparePhoto(frame));
  } catch (err) {
    camera.closeLiveCamera();
    ui.showError(t(err.code || "errGeneric"));
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
    ui.showError(t(err.code || "errUnreadable"));
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
  if (!name) return ui.showError(t("errName"));
  if (!state.photoBase64) return ui.showError(t("errPhoto"));

  state.guestName = name;
  state.guestMessage = message || t("defaultMessage");
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
  hideCompare();
  const stopProgress = ui.startProgress(t("progress"), SETTINGS.progressIntervalMs);

  const requestId = newRequestId();
  const poll = setInterval(async () => {
    const { position } = await fetchQueuePosition(requestId);
    ui.showQueuePosition(position, SETTINGS.secondsPerPortrait);
  }, SETTINGS.queuePollMs);

  try {
    let image;
    let artUrl;
    let quick = false;
    try {
      const { image: url } = await requestCaricature({
        photoBase64: state.photoBase64,
        smallPhotoBase64: state.smallPhotoBase64,
        requestId,
      });
      image = await loadImage(url);
      artUrl = url;
    } catch (err) {
      if (!err.useFilter) throw err;
      console.warn("Using on-phone watercolour:", err.message);
      image = await paintOnPhone();
      artUrl = image.toDataURL("image/jpeg", 0.9);
      quick = true;
    }
    const nameLine = t("illustratedFor", state.guestName);
    await waitForFonts(`${nameLine} ${state.guestMessage}`);
    const { frame, monogram } = getDesign();
    composePortrait($("portraitCanvas"), { image, guestName: state.guestName, message: state.guestMessage, nameLine, frame, monogram });
    showCompare(state.photoDataUrl, artUrl);
    sendKeepsakeToHosts($("portraitCanvas"), state.guestName);
    ui.setQuickNote(quick);
    goToStep(4);
    $("shareBtn").classList.toggle("hidden", !(await canShareFiles($("portraitCanvas"), state.guestName)));
  } catch (err) {
    console.error("Generation failed:", err);
    goToStep(2);
    ui.showError(t(err.code || "errGeneric"));
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
  hideCompare();
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
  "flip-camera": () => camera.flipCamera().catch(() => ui.showError(t("errCamera"))),
  lang: (el) => setLang(el.dataset.lang),
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
      action(el);
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

  const renderChips = () =>
    ui.renderSuggestionChips(t("presets"), (msg) => {
      msgEl.value = msg;
      ui.updateCharCounter(SETTINGS.maxMessageLength);
      saveDraft({ message: msg });
    });
  renderChips();
  onLangChange(renderChips);
  applyTranslations();
  loadSiteSettings().then(() => {
    applyTranslations();
    renderChips();
  });
  initCompare();
  loadDesign();

  // Lets the page load (and paint the on-phone watercolour) even with no signal, and be added to the home screen.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Offline support unavailable:", err));
  }

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
