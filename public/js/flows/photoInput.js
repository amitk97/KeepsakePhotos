// Getting the guest's photo: phone camera, laptop camera, or a file from their library.

import { t } from "../i18n/index.js";
import { state } from "../state.js";
import * as ui from "../ui/dom.js";
import * as camera from "../media/camera.js";
import { preparePhoto, processFile } from "../media/photo.js";
import { saveDraft } from "../services/drafts.js";
import { checkPhoto } from "../media/photoCheck.js";
import { goToStep } from "./navigation.js";

function setPhoto({ dataUrl, base64, smallBase64 }) {
  state.photoBase64 = base64;
  state.smallPhotoBase64 = smallBase64;
  state.photoDataUrl = dataUrl;
  ui.showPhotoPreview(dataUrl);
  ui.showPhotoWarnings([]);
  checkPhoto(dataUrl).then((problems) => {
    if (state.photoDataUrl === dataUrl) ui.showPhotoWarnings(problems.map((p) => t(`photo_${p}`)));
  });
}

// The photo buttons are <label>s for the file inputs, so a tap opens the phone's camera or gallery
// natively. On laptops with a webcam, "Take a Photo" opens the live preview instead.
function onPhotoButton(event) {
  const label = event.currentTarget;
  ui.hideError();
  saveDraft({ step: 2 });
  if (label.dataset.photo !== "camera" || camera.isTouchDevice() || !camera.canUseLiveCamera()) return; // let the label open the picker
  event.preventDefault();
  camera.openLiveCamera().catch((err) => {
    console.warn("Live camera unavailable:", err);
    camera.closeLiveCamera();
    ui.$("nativeCameraInput").click(); // fall back to the file picker
  });
}

// Labels aren't keyboard buttons by default: Enter and Space open them too.
function onPhotoKey(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.currentTarget.click();
}

export function initPhotoButtons() {
  for (const label of document.querySelectorAll("label[data-photo]")) {
    label.addEventListener("click", onPhotoButton);
    label.addEventListener("keydown", onPhotoKey);
  }
  ui.$("fileInput").addEventListener("change", onFileChosen);
  ui.$("nativeCameraInput").addEventListener("change", onFileChosen);
  initDragAndDrop();
}

// Shutter button on the laptop preview.
export function capturePhoto() {
  try {
    const frame = camera.captureFrame();
    camera.closeLiveCamera();
    setPhoto(preparePhoto(frame));
  } catch (err) {
    camera.closeLiveCamera();
    ui.showError(t(err.code || "errGeneric"));
  }
}

export function flipCamera() {
  camera.flipCamera().catch(() => ui.showError(t("errCamera")));
}

export const closeCamera = () => camera.closeLiveCamera();

// A photo arrived from the camera app or the library.
export async function onFileChosen(event) {
  const file = event.target.files[0];
  event.target.value = ""; // allow picking the same file again
  await usePhotoFile(file);
}

// Drag and drop: a photo dropped anywhere on the page is used, while the guest is on the form.
function initDragAndDrop() {
  const zone = ui.$("photoDropZone");
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  let depth = 0;
  const highlight = (on) => zone.classList.toggle("dragging", on);
  document.addEventListener("dragenter", (e) => {
    if (!hasFiles(e) || state.busy) return;
    depth++;
    highlight(true);
  });
  document.addEventListener("dragleave", () => {
    if (depth > 0 && --depth === 0) highlight(false);
  });
  document.addEventListener("dragover", (e) => {
    if (hasFiles(e)) e.preventDefault(); // allow dropping
  });
  document.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // don't let the browser open the image
    depth = 0;
    highlight(false);
    if (state.busy) return;
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name));
    if (file) usePhotoFile(file);
    else ui.showError(t("errUnreadable"));
  });
}

async function usePhotoFile(file) {
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
