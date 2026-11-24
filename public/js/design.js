// Loads your own frame and monogram artwork, if set in config.js (DESIGN).
// Missing or broken files are ignored, so the built-in frame is used instead.

import { DESIGN } from "./config.js";
import { loadImage } from "./photo.js";

const loaded = { frame: null, monogram: null };

async function tryLoad(src) {
  if (!src) return null;
  try {
    return await loadImage(src);
  } catch {
    console.warn(`Design image not found: ${src}`);
    return null;
  }
}

export async function loadDesign() {
  [loaded.frame, loaded.monogram] = await Promise.all([tryLoad(DESIGN.frameOverlay), tryLoad(DESIGN.monogram)]);
  if (loaded.monogram) {
    const slot = document.getElementById("welcomeMonogram");
    if (slot) {
      const img = new Image();
      img.src = DESIGN.monogram;
      img.alt = "";
      slot.replaceChildren(img);
      slot.classList.add("has-image");
    }
  }
  return loaded;
}

export function getDesign() {
  return loaded;
}
