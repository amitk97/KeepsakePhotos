// Free, offline watercolour filter (no ink lines) that runs on the guest's phone.
// Used as the last-resort backup when no AI engine is available.
// Steps: soften detail → flatten into paint washes → pooled pigment at wash edges
//        → soft darker pigment where colours meet → paper texture and white bleed.

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// Cheap repeatable noise so the paper looks the same every time.
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function boxBlurGray(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / span;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / span;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

export function watercolorize(source, { maxEdge = 1200, seed = 7 } = {}) {
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const blurPx = Math.max(1.5, w / 400);

  // 1. Soft, slightly saturated base (removes skin pores, noise, fine texture).
  const base = makeCanvas(w, h);
  const bctx = base.getContext("2d", { willReadFrequently: true });
  bctx.filter = `blur(${blurPx}px) saturate(1.25) contrast(1.05)`;
  bctx.drawImage(source, 0, 0, w, h);
  bctx.filter = "none";
  const img = bctx.getImageData(0, 0, w, h);
  const px = img.data;
  const n = w * h;

  // Luminance of the soft base, for outlines.
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];

  // 2. Where colours meet, watercolour pigment gathers: find edges, then blur them so they read as paint, not lines.
  const edges = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy = -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      const g = Math.sqrt(gx * gx + gy * gy);
      edges[i] = Math.min(1, Math.max(0, (g - 70) / 160));
    }
  }

  // 3. Flatten colour into washes (posterise), and find where washes meet for pooled pigment.
  // Quantise on brightness only (keeps hues natural), and only halfway, so washes stay soft.
  const levels = 6;
  const step = 255 / (levels - 1);
  const washLum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const l = lum[i] || 1;
    const q = Math.round(l / step) * step;
    const k = (l * 0.5 + q * 0.5) / l;
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.min(255, px[i * 4 + c] * k);
    washLum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  }
  const washSoft = boxBlurGray(washLum, w, h, Math.round(blurPx * 2));
  const edgeSoft = boxBlurGray(edges, w, h, Math.max(1, Math.round(blurPx)));
  bctx.putImageData(img, 0, 0);

  // Soften the hard posterised steps so they look like bleeding paint.
  const wash = makeCanvas(w, h);
  const wctx = wash.getContext("2d", { willReadFrequently: true });
  wctx.filter = `blur(${blurPx * 1.6}px)`;
  wctx.drawImage(base, 0, 0);
  wctx.filter = "none";
  const out = wctx.getImageData(0, 0, w, h);
  const o = out.data;

  // 4. Paper: fine grain + large soft blotches, and lighten towards white like real watercolour.
  const rand = seededRandom(seed);
  const grain = new Float32Array(n);
  for (let i = 0; i < n; i++) grain[i] = rand();
  const blotch = boxBlurGray(grain, w, h, Math.round(w / 40));
  const paper = [250, 246, 238]; // ivory, matches the keepsake background

  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const pool = Math.max(0, washSoft[i] - washLum[i]) / 255; // darker rim where a wash ends
    // Light areas fade to paper (watercolour leaves highlights unpainted); blotches make it uneven.
    const light = Math.max(0, (lum[i] - 150) / 105);
    const bleed = Math.min(0.85, 0.12 + light * 0.55 + (blotch[i] - 0.5) * 0.6);
    const tex = 0.94 + grain[i] * 0.06;
    const rim = Math.min(1, edgeSoft[i] * 1.6); // soft pigment rim, not an outline
    for (let c = 0; c < 3; c++) {
      let v = o[j + c];
      v = v * (1 - bleed) + paper[c] * bleed; // watery, lighter colour
      v *= 1 - pool * 1.4; // pigment pooling at edges
      v *= tex; // paper grain
      v *= 1 - rim * 0.28; // a little deeper colour along the edges
      o[j + c] = Math.max(0, Math.min(255, v));
    }
  }
  wctx.putImageData(out, 0, 0);
  return wash;
}
