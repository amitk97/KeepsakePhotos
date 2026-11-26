// Makes sure the chosen background colour shows. The AI doesn't always follow colour instructions,
// so after painting, cloudy washes of the guest's colour are added on the plain paper (very light,
// almost colourless pixels): mostly around the edges and corners, fading to white behind the people. Only paper joined to the picture's edges counts, so white
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

// Watercolour-paper shape: cloudy washes of one colour, strongest around the edges and corners,
// fading to white paper behind the people, with darker pools, lighter patches and a few speckles.
// Returns strength 0–1 for each pixel.
function splashShape(w, h) {
  const rand = mulberry32((w * 7919 + h * 104729) >>> 0); // the same picture gets the same wash
  const noise = valueNoise(rand);
  const speckles = Array.from({ length: 40 }, () => ({ x: rand(), y: rand(), r: 0.002 + rand() * 0.004 }));
  return (x, y) => {
    const u = x / w, v = y / h;
    // 0 in the middle, rising towards the edges (an oval "vignette"), pushed around by noise so the edge is cloudy.
    const dx = (u - 0.5) / 0.5, dy = (v - 0.5) / 0.5;
    const edge = Math.hypot(dx * 0.95, dy) + (noise(u * 3, v * 3) - 0.5) * 0.6;
    let k = smooth(Math.min(1, Math.max(0, (edge - 0.55) / 0.5)));
    // Cloudy variation inside the wash: darker pools and lighter blooms.
    const cloud = noise(u * 6 + 10, v * 6 + 10) * 0.6 + noise(u * 14 + 20, v * 14 + 20) * 0.4;
    k *= 0.45 + 0.75 * cloud;
    for (const s of speckles) if (Math.hypot(u - s.x, (v - s.y) * (h / w)) < s.r) k = Math.max(k, 0.9);
    return Math.min(1, k);
  };
}

// Smooth random noise (0–1), for cloudy shapes.
function valueNoise(rand) {
  const size = 64;
  const grid = Float32Array.from({ length: size * size }, rand);
  const at = (x, y) => grid[((y % size) + size) % size * size + (((x % size) + size) % size)];
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return top + (bottom - top) * fy;
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
