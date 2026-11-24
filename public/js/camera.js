// Camera: phones use the native camera app (most reliable); laptops get a live preview.

import { $ } from "./ui.js";

let stream = null;
let facing = "user";
let returnFocusTo = null;

// Keeps Tab inside the camera window while it's open.
function trapFocus(e) {
  if (e.key !== "Tab") return;
  const items = [...$("cameraModal").querySelectorAll("button")];
  const first = items[0];
  const last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function isTouchDevice() {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function canUseLiveCamera() {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
}

// Must be called directly from a tap/click: browsers only open the camera from a user gesture.
export function openNativeCamera() {
  $("nativeCameraInput").click();
}

export async function openLiveCamera() {
  stopTracks();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });
  const video = $("cameraVideo");
  video.srcObject = stream;
  video.classList.toggle("mirror-video", facing === "user");
  const modal = $("cameraModal");
  if (modal.classList.contains("hidden")) {
    returnFocusTo = document.activeElement;
    modal.addEventListener("keydown", trapFocus);
  }
  modal.classList.remove("hidden");
  modal.querySelector(".shutter").focus();
  await video.play();
}

export function flipCamera() {
  facing = facing === "user" ? "environment" : "user";
  return openLiveCamera();
}

function stopTracks() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

export function closeLiveCamera() {
  stopTracks();
  $("cameraVideo").srcObject = null;
  const modal = $("cameraModal");
  const wasOpen = !modal.classList.contains("hidden");
  modal.classList.add("hidden");
  modal.removeEventListener("keydown", trapFocus);
  if (wasOpen && returnFocusTo?.isConnected) returnFocusTo.focus();
  returnFocusTo = null;
}

// Returns a canvas with the 3:4 area the guest saw, un-mirrored for the selfie camera.
export function captureFrame() {
  const video = $("cameraVideo");
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw Object.assign(new Error("Camera not ready"), { code: "errCameraNotReady" });

  let sw = vw;
  let sh = vh;
  if (vw / vh > 3 / 4) sw = (vh * 3) / 4;
  else sh = (vw * 4) / 3;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext("2d");
  if (facing === "user") {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}
