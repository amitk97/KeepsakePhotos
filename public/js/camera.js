// Camera: phones use the native camera app (most reliable); laptops get a live preview.

import { $ } from "./ui.js";

let stream = null;
let facing = "user";

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
  $("cameraModal").classList.remove("hidden");
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
  $("cameraModal").classList.add("hidden");
}

// Returns a canvas with the 3:4 area the guest saw, un-mirrored for the selfie camera.
export function captureFrame() {
  const video = $("cameraVideo");
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Camera isn't ready yet. Please try again.");

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
