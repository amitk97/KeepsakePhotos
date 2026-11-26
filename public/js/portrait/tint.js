// Makes sure the chosen background colour shows. The AI doesn't always follow colour instructions,
// so after painting, a watercolour splash of the guest's colour is added on the plain paper behind
// the people (very light, almost colourless pixels): strongest in the middle, with soft, uneven,
// blotchy edges fading to white paper. Only paper joined to the picture's edges counts, so white
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

  const splash = splashShape(w, h);
  for (let p = 0, i = 0; p < paper.length; p++, i += 4) {
    if (!reached[p]) continue;
    const k = paper[p] * splash(p % w, (p / w) | 0);
    if (k <= 0) continue;
    // Multiply-style tint keeps the paper's watercolour texture.
    px[i] += (px[i] * tr / 255 - px[i]) * k;
    px[i + 1] += (px[i + 1] * tg / 255 - px[i + 1]) * k;
    px[i + 2] += (px[i + 2] * tb / 255 - px[i + 2]) * k;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

// A random watercolour-splash shape: 1 in the middle, fading to 0 at a wobbly edge, with blotches.
function splashShape(w, h) {
  const rand = mulberry32((w * 7919 + h * 104729) >>> 0); // the same picture gets the same splash
  const waves = Array.from({ length: 6 }, (_, n) => ({ f: n + 2, a: 0.05 + rand() * 0.06, p: rand() * 6.28 }));
  const blots = Array.from({ length: 18 }, () => ({ x: 0.1 + rand() * 0.8, y: 0.1 + rand() * 0.8, r: 0.06 + rand() * 0.12, s: 0.2 + rand() * 0.3 }));
  const cx = 0.5, cy = 0.5, rx = 0.56, ry = 0.5;
  return (x, y) => {
    const u = x / w, v = y / h;
    const dx = (u - cx) / rx, dy = (v - cy) / ry;
    const angle = Math.atan2(dy, dx);
    let edge = 1;
    for (const wv of waves) edge += wv.a * Math.sin(wv.f * angle + wv.p); // wobbly outline
    const d = Math.hypot(dx, dy) / edge;
    let k = d < 0.7 ? 1 : d > 1 ? 0 : 1 - smooth((d - 0.7) / 0.3);
    for (const b of blots) {
      const bd = Math.hypot(u - b.x, v - b.y) / b.r;
      if (bd < 1) k += b.s * (1 - bd * bd) * (k > 0 ? 1 : 0.6); // darker pools, little bleeds past the edge
    }
    // Uneven strength inside the splash (0.65–1), like pigment settling unevenly.
    return Math.min(1, k) * (0.65 + 0.35 * Math.min(1, k));
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
