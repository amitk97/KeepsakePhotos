// Reading, converting (HEIC) and resizing guest photos.

import { SETTINGS } from "./config.js";

export class PhotoError extends Error {}

export function isHeic(file) {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || "");
}

export function validateFile(file) {
  if (file.size > SETTINGS.maxFileBytes) {
    throw new PhotoError("That photo is over 30 MB. Please choose a smaller one.");
  }
  if (!file.type.startsWith("image/") && !isHeic(file)) {
    throw new PhotoError("Please choose a photo (JPG, PNG, WebP or HEIC).");
  }
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new PhotoError("Couldn't load image."));
    img.src = src;
  });
}

async function loadImageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new PhotoError("Couldn't load the photo converter."));
    document.head.appendChild(s);
  });
}

// Safari reads HEIC natively; other browsers need converting to JPEG first.
async function decodeFile(file) {
  try {
    return await loadImageFromBlob(file);
  } catch (err) {
    if (!isHeic(file)) throw err;
    await loadScript(SETTINGS.heicConverterUrl);
    const out = await window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    return loadImageFromBlob(Array.isArray(out) ? out[0] : out);
  }
}

// Scales an image or canvas so its longest edge is at most maxEdge, and returns a JPEG.
export function toResizedJpeg(source, maxEdge = SETTINGS.maxPhotoEdge, quality = SETTINGS.photoQuality) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  if (!w || !h) throw new PhotoError("That photo looks empty. Please try another.");

  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF"; // transparent PNGs become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl, base64: dataUrl.split(",")[1] };
}

// The full photo for the AI, plus a small copy for engines that need one.
export function preparePhoto(source) {
  const full = toResizedJpeg(source);
  const small = toResizedJpeg(source, SETTINGS.smallPhotoEdge, 0.88);
  return { dataUrl: full.dataUrl, base64: full.base64, smallBase64: small.base64 };
}

export async function processFile(file) {
  validateFile(file);
  let img;
  try {
    img = await decodeFile(file);
  } catch {
    throw new PhotoError("We couldn't read that photo. Please try a different one.");
  }
  return preparePhoto(img);
}
