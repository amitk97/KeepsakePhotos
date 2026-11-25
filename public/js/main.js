// Starts the guest page. Buttons in index.html say what they do with data-action="…"
// (the photo buttons are labels, wired in flows/photoInput.js);
// this table maps each one to a function. The work itself lives in flows/.

import { applyTranslations, setLang } from "./i18n/index.js";
import { state } from "./state.js";
import { $ } from "./ui/dom.js";
import { initCompare } from "./ui/compare.js";
import { initSample } from "./ui/sample.js";
import { loadDesign } from "./ui/design.js";
import { closeLiveCamera } from "./media/camera.js";
import { loadSiteSettings } from "./services/siteSettings.js";
import { downloadPortrait, sharePortrait } from "./services/share.js";
import { goToStep } from "./flows/navigation.js";
import * as photo from "./flows/photoInput.js";
import { makePortrait } from "./flows/portrait.js";
import { initForm, renderChips, resetApp } from "./flows/form.js";

const actions = {
  begin: () => goToStep(2),
  lang: (el) => setLang(el.dataset.lang),
  "flip-camera": photo.flipCamera,
  "close-camera": photo.closeCamera,
  capture: photo.capturePhoto,
  regenerate: makePortrait,
  share: () => sharePortrait($("portraitCanvas"), state.guestName),
  download: () => downloadPortrait($("portraitCanvas"), state.guestName),
  reset: resetApp,
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  const action = el && actions[el.dataset.action];
  if (action) {
    e.preventDefault();
    action(el);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLiveCamera();
});
photo.initPhotoButtons();

initForm();
applyTranslations();
initCompare();
  initSample();
loadDesign();
// Wording changed on the admin page arrives a moment later.
loadSiteSettings().then(() => {
  applyTranslations();
  renderChips();
});

// Offline support and "add to home screen".
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Offline support unavailable:", err));
}
