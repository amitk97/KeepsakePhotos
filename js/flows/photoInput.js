// Getting the guest's photo: phone camera, laptop camera, or a file from their library.

import { t } from "../i18n/index.js";
import { state } from "../state.js";
import * as ui from "../ui/dom.js";
import * as camera from "../media/camera.js";
import { preparePhoto, processFile } from "../media/photo.js";
import { saveDraft } from "../services/drafts.js";
import { goToStep } from "./navigation.js";

function setPhoto({ dataUrl, base64, smallBase64 }) {
  state.photoBase64 = base64;
  state.smallPhotoBase64 = smallBase64;
  state.photoDataUrl = dataUrl;
  ui.showPhotoPreview(dataUrl);
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
