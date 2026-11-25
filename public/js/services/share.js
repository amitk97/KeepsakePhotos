// Saving and sharing the finished portrait.

import { WEDDING } from "../config.js";

// e.g. "Amit_keepsake_Pooja_and_Amit_wedding.png", easy to find in a photo library.
export function portraitFileName(guestName) {
  const clean = (text) => text.replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  const guest = clean(guestName || "") || "Guest";
  return `${guest}_keepsake_${clean(WEDDING.coupleNames)}_wedding.png`;
}

// e.g. "Amit's keepsake from Pooja & Amit's wedding"
export function shareTitle(guestName) {
  const who = (guestName || "").trim();
  return who ? `${who}'s keepsake from ${WEDDING.coupleNames}'s wedding` : `My keepsake from ${WEDDING.coupleNames}'s wedding`;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create image"))), "image/png")
  );
}

async function portraitFile(canvas, guestName) {
  const blob = await canvasToBlob(canvas);
  return new File([blob], portraitFileName(guestName), { type: "image/png" });
}

// True on phones that can share files (gives iPhone users "Save Image" to Photos).
export async function canShareFiles(canvas, guestName) {
  if (!navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [await portraitFile(canvas, guestName)] });
  } catch {
    return false;
  }
}

// Shares the picture itself where the phone allows it (WhatsApp, Messages, Save to Photos…);
// otherwise shares a link to the site, and failing that saves the picture.
export async function sharePortrait(canvas, guestName) {
  const title = shareTitle(guestName);
  try {
    if (await canShareFiles(canvas, guestName)) {
      await navigator.share({ files: [await portraitFile(canvas, guestName)], title, text: title });
    } else if (navigator.share) {
      await navigator.share({ title, text: `${title}. Make yours:`, url: new URL("./", location.href).href });
    } else {
      await downloadPortrait(canvas, guestName);
    }
  } catch (err) {
    if (err.name !== "AbortError") await downloadPortrait(canvas, guestName);
  }
}

export async function downloadPortrait(canvas, guestName) {
  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = portraitFileName(guestName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// The guest's own photo, as they chose it (or the camera snapshot).
export function downloadOriginal(photo, guestName) {
  const url = photo instanceof Blob ? URL.createObjectURL(photo) : photo;
  const ext = photo instanceof Blob && photo.type === "image/png" ? "png" : photo instanceof Blob && photo.type === "image/webp" ? "webp" : "jpg";
  const link = document.createElement("a");
  link.href = url;
  link.download = portraitFileName(guestName).replace(/\.png$/, `_original.${ext}`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (photo instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
