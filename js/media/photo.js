// Reading, converting (HEIC) and resizing guest photos.

import { SETTINGS } from "../config.js";

// code matches an error key in i18n/strings.js (errTooLarge, errNotImage, errUnreadable).
export class PhotoError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

export function isHeic(file) {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || "");
}

export function validateFile(file) {
  if (file.size > SETTINGS.maxFileBytes) {
    throw new PhotoError("errTooLarge");
  }
  if (!file.type.startsWith("image/") && !isHeic(file)) {
    throw new PhotoError("errNotImage");
  }
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new PhotoError("errUnreadable"));
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
    s.onerror = () => reject(new PhotoError("errUnreadable"));
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
  if (!w || !h) throw new PhotoError("errUnreadable");

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

// Adds plain paper above and around the photo before it goes to the AI. A close-up selfie
// otherwise leaves no room: asked for a full caricature, the AI pushes the head off the top.
export const HEADROOM = { top: 0.18, sides: 0.08, paper: "#f7f1e6" };

export function withHeadroom(source) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  if (!w || !h) throw new PhotoError("errUnreadable");
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * (1 + 2 * HEADROOM.sides));
  canvas.height = Math.round(h * (1 + HEADROOM.top));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = HEADROOM.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, Math.round(w * HEADROOM.sides), canvas.height - h, w, h); // photo at the bottom
  return canvas;
}

// The guest's photo for previews (dataUrl), plus the copies for the AI (with headroom):
// a full one, and a small one for engines that need it.
export function preparePhoto(source) {
  const preview = toResizedJpeg(source);
  const roomy = withHeadroom(source);
  const full = toResizedJpeg(roomy);
  const small = toResizedJpeg(roomy, SETTINGS.smallPhotoEdge, 0.88);
  return { dataUrl: preview.dataUrl, base64: full.base64, smallBase64: small.base64 };
}

export async function processFile(file) {
  validateFile(file);
  let img;
  try {
    img = await decodeFile(file);
  } catch {
    throw new PhotoError("errUnreadable");
  }
  return preparePhoto(img);
}
