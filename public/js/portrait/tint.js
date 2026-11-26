// Makes sure the chosen background colour shows. The AI doesn't always follow colour instructions,
// so after painting, the plain paper around the people (very light, almost colourless pixels) is
// gently tinted with the guest's colour. Only paper joined to the picture's edges counts, so white
// clothes, teeth and eyes inside the people are left alone.

const LIGHT = 225; // pixels lighter than this (0–255) and nearly grey count as paper
const GREY = 28; // how far from grey a pixel may be and still count as paper

export function tintPaper(image, hex) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  if (!hex) return canvas;

  const tr = parseInt(hex.slice(1, 3), 16);
  const tg = parseInt(hex.slice(3, 5), 16);
  const tb = parseInt(hex.slice(5, 7), 16);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // How "paper-like" each pixel is: 0 = not paper, up to 1 = clearly paper.
  const paper = new Float32Array(w * h);
  for (let p = 0, i = 0; p < paper.length; p++, i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const light = (r + g + b) / 3;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (light < LIGHT - 30 || spread > GREY) continue;
    // Fades in from LIGHT-30 to LIGHT, so edges blend instead of making a hard line.
    paper[p] = Math.min(1, (light - (LIGHT - 30)) / 30) * (1 - spread / GREY);
  }

  // Keep only paper reachable from the edges of the picture.
  const reached = new Uint8Array(w * h);
  const stack = [];
  const visit = (p) => {
    if (!reached[p] && paper[p] > 0) {
      reached[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) visit(x), visit((h - 1) * w + x);
  for (let y = 0; y < h; y++) visit(y * w), visit(y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    if (x > 0) visit(p - 1);
    if (x < w - 1) visit(p + 1);
    if (p >= w) visit(p - w);
    if (p < w * (h - 1)) visit(p + w);
  }

  for (let p = 0, i = 0; p < paper.length; p++, i += 4) {
    if (!reached[p]) continue;
    const k = paper[p];
    // Multiply-style tint keeps the paper's watercolour texture.
    px[i] += (px[i] * tr / 255 - px[i]) * k;
    px[i + 1] += (px[i + 1] * tg / 255 - px[i + 1]) * k;
    px[i + 2] += (px[i + 2] * tb / 255 - px[i + 2]) * k;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}
