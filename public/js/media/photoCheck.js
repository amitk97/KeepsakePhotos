// A quick check of the guest's photo before painting, so they don't wait a minute for a poor result.
// Looks at brightness, sharpness and (where the browser supports it) whether a face is visible.
// Returns a list of problem codes: "dark", "bright", "blurry", "noFace". Empty = looks fine.
// It only warns: the guest can always carry on.

// Tune these if the check is too fussy or too relaxed.
export const LIMITS = {
  darkBelow: 55, // average brightness 0–255
  brightAbove: 225,
  blurryBelow: 60, // sharpness score (edge strength); lower = blurrier
};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Brightness and sharpness from a small greyscale copy of the photo.
export function measure(pixels, width, height) {
  const grey = new Float32Array(width * height);
  let total = 0;
  for (let i = 0; i < grey.length; i++) {
    const g = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
    grey[i] = g;
    total += g;
  }
  // Sharpness: how much the Laplacian (edge filter) varies. Blurry photos have weak edges.
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - width] - grey[i + width];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return { brightness: total / grey.length, sharpness: sumSq / n - mean * mean };
}

export function problemsFrom({ brightness, sharpness }) {
  const problems = [];
  if (brightness < LIMITS.darkBelow) problems.push("dark");
  else if (brightness > LIMITS.brightAbove) problems.push("bright");
  // Very dark or bright photos always look soft, so only judge sharpness when the light is fine.
  else if (sharpness < LIMITS.blurryBelow) problems.push("blurry");
  return problems;
}

async function hasFace(img) {
  if (typeof window === "undefined" || !("FaceDetector" in window)) return true; // can't tell: don't warn
  try {
    const faces = await new window.FaceDetector({ fastMode: true }).detect(img);
    return faces.length > 0;
  } catch {
    return true;
  }
}

export async function checkPhoto(dataUrl) {
  try {
    const img = await loadImage(dataUrl);
    const width = 320;
    const height = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * width));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);
    const problems = problemsFrom(measure(ctx.getImageData(0, 0, width, height).data, width, height));
    if (!(await hasFace(img))) problems.push("noFace");
    return problems;
  } catch (err) {
    console.warn("Photo check skipped:", err);
    return [];
  }
}
