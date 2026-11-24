// Saving and sharing the finished portrait.

import { WEDDING } from "../config.js";

export function portraitFileName(guestName) {
  const safe = (guestName || "guest").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase() || "guest";
  return `${WEDDING.fileNamePrefix}_${safe}.png`;
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

export async function sharePortrait(canvas, guestName) {
  const file = await portraitFile(canvas, guestName);
  try {
    await navigator.share({ files: [file], title: `My ${WEDDING.coupleNames} wedding portrait` });
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
