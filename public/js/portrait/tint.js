// Makes sure the chosen background colour shows. The AI doesn't always follow colour instructions,
// so after painting, the background (light areas joined to the edges, stopped by the people's outlines)
// is washed with cloudy washes of the guest's one colour, strongest around the edges and corners and
// fading out towards the middle, so other colours the AI put around the edges are covered. Only paper joined to the picture's edges counts, so white
// clothes, teeth and eyes inside the people are left alone.

const BACKGROUND_LIGHT = 175; // pixels at least this light (0–255), joined to the edges, count as background

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

  // Background = light pixels (paper, pale washes, pastel scenery the AI may have added) joined to
  // the picture's edges. The people's dark outlines stop it, so faces and clothes inside are kept.
  const light = new Float32Array(w * h);
  for (let p = 0, i = 0; p < light.length; p++, i += 4) light[p] = (px[i] + px[i + 1] + px[i + 2]) / 3;

  const reached = new Uint8Array(w * h);
  const stack = [];
  const visit = (p) => {
    if (!reached[p] && light[p] >= BACKGROUND_LIGHT) {
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

  // Wash the background towards white paper with cloudy washes of the one chosen colour. The strength
  // follows the splash shape: strong at the edges and corners, fading to nothing in the middle, so
  // anything in the middle (where the people are) stays as painted even if a light area was caught,
  // e.g. white or gold clothes without a dark outline.
  const splash = splashShape(w, h);
  for (let p = 0, i = 0; p < light.length; p++, i += 4) {
    if (!reached[p]) continue;
    const k = splash(p % w, (p / w) | 0);
    if (k <= 0) continue;
    const texture = Math.min(1, light[p] / 245); // keeps the paper's light and dark grain
    for (const [c, t] of [[0, tr], [1, tg], [2, tb]]) px[i + c] += (t * texture - px[i + c]) * k;
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
