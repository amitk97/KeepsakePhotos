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

// Phones: opens the camera app. Laptops: opens the live preview.
export function takePhoto() {
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
export const chooseFromLibrary = () => ui.$("fileInput").click();

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
