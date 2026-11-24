// Free, offline watercolour filter that runs on the guest's phone (no ink lines).
// Used as the last-resort backup when no AI engine is available.
//
// 1. Kuwahara filter: an edge-preserving smoothing that turns skin, fabric and background into
//    soft brush-like patches while keeping faces, eyes and outlines readable.
// 2. Watery colour: light areas lift towards the paper, colours bleed slightly.
// 3. Pigment pools a little darker where washes meet (no drawn lines).
// 4. Granulation and paper grain, stronger in darker paint, like real pigment settling.
// 5. An uneven unpainted paper border, as if the painting stops short of the edge.

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// Repeatable noise so the paper looks the same every time.
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / span;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
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

// Kuwahara filter using summed-area tables, so its cost doesn't grow with the radius.
// For each pixel, of the four (r+1)×(r+1) squares touching it, take the average colour of the
// square whose brightness varies least.
function kuwahara(px, w, h, r) {
  const W = w + 1;
  const n = W * (h + 1);
  const sR = new Float64Array(n);
  const sG = new Float64Array(n);
  const sB = new Float64Array(n);
  const sL = new Float64Array(n);
  const sL2 = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    let aR = 0, aG = 0, aB = 0, aL = 0, aL2 = 0;
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      const R = px[j], G = px[j + 1], B = px[j + 2];
      const L = 0.299 * R + 0.587 * G + 0.114 * B;
      aR += R; aG += G; aB += B; aL += L; aL2 += L * L;
      const k = (y + 1) * W + x + 1;
      const up = y * W + x + 1;
      sR[k] = sR[up] + aR; sG[k] = sG[up] + aG; sB[k] = sB[up] + aB;
      sL[k] = sL[up] + aL; sL2[k] = sL2[up] + aL2;
    }
  }
  const box = (t, x0, y0, x1, y1) => t[y1 * W + x1] - t[y0 * W + x1] - t[y1 * W + x0] + t[y0 * W + x0];
  const out = new Uint8ClampedArray(px.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity, bR = 0, bG = 0, bB = 0;
      for (let q = 0; q < 4; q++) {
        const x0 = Math.max(0, q & 1 ? x : x - r);
        const x1 = Math.min(w, (q & 1 ? x + r : x) + 1);
        const y0 = Math.max(0, q & 2 ? y : y - r);
        const y1 = Math.min(h, (q & 2 ? y + r : y) + 1);
        const area = (x1 - x0) * (y1 - y0);
        const mL = box(sL, x0, y0, x1, y1) / area;
        const v = box(sL2, x0, y0, x1, y1) / area - mL * mL;
        if (v < best) {
          best = v;
          bR = box(sR, x0, y0, x1, y1) / area;
          bG = box(sG, x0, y0, x1, y1) / area;
          bB = box(sB, x0, y0, x1, y1) / area;
        }
      }
      const j = (y * w + x) * 4;
      out[j] = bR; out[j + 1] = bG; out[j + 2] = bB; out[j + 3] = 255;
    }
  }
  return out;
}

export function watercolorize(source, { maxEdge = 1100, seed = 7 } = {}) {
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const n = w * h;
  const unit = Math.max(w, h) / 600; // keeps the look the same at any size

  // Base: tiny blur removes camera noise, a little extra colour.
  const base = makeCanvas(w, h);
  const bctx = base.getContext("2d", { willReadFrequently: true });
  bctx.filter = `blur(${Math.max(0.6, unit * 0.6)}px) saturate(1.18)`;
  bctx.drawImage(source, 0, 0, w, h);
  bctx.filter = "none";
  const src = bctx.getImageData(0, 0, w, h);

  // 1. Painterly patches: a fine pass keeps faces, a broader pass makes the washes; mixing the two
  //    keeps eyes and smiles clear. A light smoothing then rounds off the square patch edges.
  const finePass = kuwahara(src.data, w, h, Math.max(2, Math.round(unit * 2)));
  const broadPass = kuwahara(finePass, w, h, Math.max(3, Math.round(unit * 3.5)));
  const paint = new Uint8ClampedArray(broadPass.length);
  const channel = new Float32Array(n);
  const smoothR = Math.max(1, Math.round(unit * 1.2));
  for (let c = 0; c < 4; c++) {
    if (c === 3) {
      for (let i = 0; i < n; i++) paint[i * 4 + 3] = 255;
      break;
    }
    for (let i = 0; i < n; i++) channel[i] = broadPass[i * 4 + c] * 0.6 + finePass[i * 4 + c] * 0.4;
    const smooth = boxBlur(boxBlur(channel, w, h, smoothR), w, h, smoothR);
    for (let i = 0; i < n; i++) paint[i * 4 + c] = smooth[i];
  }

  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * paint[i * 4] + 0.587 * paint[i * 4 + 1] + 0.114 * paint[i * 4 + 2];

  // 3. Where washes meet: edge strength, softened so it reads as pooled pigment, not a line.
  const edges = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = lum[i + 1] - lum[i - 1];
      const gy = lum[i + w] - lum[i - w];
      edges[i] = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 90);
    }
  }
  const edgeSoft = boxBlur(edges, w, h, Math.max(1, Math.round(unit * 1.2)));

  // 2. Colour bleed: a softly blurred copy mixed in, so neighbouring colours run into each other.
  //    (Own blur, which repeats edge pixels, so borders don't darken.)
  const bleed = new Float32Array(n * 3);
  const bleedR = Math.max(2, Math.round(unit * 3));
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) channel[i] = paint[i * 4 + c];
    const b = boxBlur(boxBlur(channel, w, h, bleedR), w, h, bleedR);
    for (let i = 0; i < n; i++) bleed[i * 3 + c] = b[i];
  }

  // 4–5. Paper, granulation and the unpainted border.
  const rand = seededRandom(seed);
  const grain = new Float32Array(n);
  for (let i = 0; i < n; i++) grain[i] = rand();
  const fine = boxBlur(grain, w, h, 1);
  const blotch = boxBlur(boxBlur(grain, w, h, Math.round(unit * 14)), w, h, Math.round(unit * 10));
  const paper = [250, 246, 238]; // ivory, matches the keepsake
  const margin = Math.min(w, h) * 0.05;

  const out = bctx.createImageData(w, h);
  const o = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const j = i * 4;
      const L = lum[i] / 255;

      // Unpainted, slightly ragged edge.
      const d = Math.min(x, y, w - 1 - x, h - 1 - y);
      const rag = margin * (0.55 + (blotch[i] - 0.5) * 6);
      const edgeFade = Math.min(1, Math.max(0, (d - rag) / (margin * 0.9)));

      // Highlights lift to paper; uneven pigment from the blotch noise.
      const lift = Math.min(0.9, Math.max(0, (L - 0.62) / 0.38) * 0.75 + 0.08 + (blotch[i] - 0.5) * 0.9);
      const pool = Math.min(1, edgeSoft[i] * 1.5) * 0.22;
      const granule = 1 - (1 - L) * (fine[i] - 0.5) * 0.35;
      const tooth = 0.965 + grain[i] * 0.035;

      for (let c = 0; c < 3; c++) {
        let v = paint[j + c] * 0.72 + bleed[i * 3 + c] * 0.28;
        v = v * (1 - lift) + paper[c] * lift;
        v *= (1 - pool) * granule * tooth;
        v = v * edgeFade + paper[c] * tooth * (1 - edgeFade);
        o[j + c] = v;
      }
      o[j + 3] = 255;
    }
  }

  const result = makeCanvas(w, h);
  result.getContext("2d").putImageData(out, 0, 0);
  return result;
}
