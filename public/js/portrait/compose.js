// Lays out the final 1200×1800 (4×6 print ratio) keepsake on a canvas.

import { THEME, WEDDING } from "../config.js";
import { clampLines, fitText, wrapText } from "./text.js";
import { drawDoubleBorder, drawImageCover, drawSpeechBubble, roundRectPath } from "./shapes.js";

export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 1800;

// Noto Serif Gujarati / Devanagari draw the Gujarati and Hindi letters the Latin fonts lack.
const SERIF = '"Cormorant Garamond", "Noto Serif Gujarati", "Noto Serif Devanagari", Georgia, serif';
const SANS = '"Plus Jakarta Sans", "Noto Serif Gujarati", "Noto Serif Devanagari", system-ui, sans-serif';

const FONTS = {
  title: `bold 54px ${SERIF}`,
  venue: `600 20px ${SANS}`,
  message: `italic 34px ${SERIF}`,
  name: `bold 42px ${SERIF}`,
  footer: `600 18px ${SANS}`,
};

// The art window, so a custom frame designer knows where the painting sits (see public/frames/README.md).
export const ART_WINDOW = { x: 192, y: 442, w: 816, h: 1088 };

// Pass the guest's text so the right script fonts (Gujarati, Devanagari) are fetched before drawing.
export async function waitForFonts(sampleText = "") {
  try {
    const text = `Aa ${sampleText}`;
    await Promise.all(Object.values(FONTS).map((f) => document.fonts.load(f, text)));
    await document.fonts.ready;
  } catch {
    // fall back to system fonts
  }
}

function drawBackground(ctx, w, h) {
  ctx.fillStyle = THEME.ivory;
  ctx.fillRect(0, 0, w, h);
  const grad = ctx.createRadialGradient(w / 2, h / 2, 200, w / 2, h / 2, 900);
  grad.addColorStop(0, "#FFFFFF");
  grad.addColorStop(1, THEME.parchment);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// Today's date, so keepsakes made on the wedding day carry the wedding date. A venue, if set, goes first.
export function keepsakeDateLine(now = new Date()) {
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
  return WEDDING.venueLine ? `${WEDDING.venueLine}  •  ${date}` : date;
}

function drawHeader(ctx, w) {
  ctx.textAlign = "center";
  ctx.fillStyle = THEME.green;
  ctx.font = FONTS.title;
  ctx.fillText(WEDDING.coupleNames, w / 2, 120);

  ctx.fillStyle = THEME.gold;
  ctx.font = FONTS.venue;
  ctx.fillText(keepsakeDateLine(), w / 2, 155);

  ctx.strokeStyle = THEME.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 120, 175);
  ctx.lineTo(w / 2 + 120, 175);
  ctx.stroke();
}

function drawMessage(ctx, w, message) {
  const box = { x: 140, y: 210, w: w - 280, h: 170 };
  drawSpeechBubble(ctx, { ...box, fill: "#FFFFFF", stroke: THEME.gold });

  ctx.fillStyle = THEME.green;
  ctx.font = FONTS.message;
  ctx.textAlign = "center";
  const maxWidth = box.w - 60;
  const lines = clampLines(ctx, wrapText(ctx, `“${message}”`, maxWidth), 3, maxWidth);
  const lineHeight = 42;
  const startY = box.y + box.h / 2 - ((lines.length - 1) * lineHeight) / 2 + 10;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lineHeight));
}

// Returns where the frame ends so the footer can sit beneath it.
function drawPortraitFrame(ctx, w, img) {
  const pad = 12;
  const frameW = 840;
  const innerW = frameW - pad * 2;
  const innerH = Math.round((innerW * 4) / 3); // 3:4 to match the generated art
  const frameH = innerH + pad * 2;
  const x = (w - frameW) / 2;
  const y = 430;

  ctx.save();
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(29, 59, 45, 0.1)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 10;
  roundRectPath(ctx, x, y, frameW, frameH, 24);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = THEME.gold;
  ctx.lineWidth = 3;
  roundRectPath(ctx, x, y, frameW, frameH, 24);
  ctx.stroke();

  ctx.save();
  roundRectPath(ctx, x + pad, y + pad, innerW, innerH, 16);
  ctx.clip();
  drawImageCover(ctx, img, x + pad, y + pad, innerW, innerH);
  ctx.restore();

  return y + frameH;
}

function drawFooter(ctx, w, top, nameLine) {
  ctx.textAlign = "center";
  ctx.fillStyle = THEME.green;
  ctx.font = FONTS.name;
  ctx.fillText(fitText(ctx, nameLine, w - 240), w / 2, top + 75);

  ctx.fillStyle = THEME.gold;
  ctx.font = FONTS.footer;
  ctx.fillText(WEDDING.footerLine, w / 2, top + 117);
}

// Small monogram centred under the footer text.
function drawMonogram(ctx, w, top, monogram) {
  const size = 56;
  const iw = monogram.naturalWidth || monogram.width;
  const ih = monogram.naturalHeight || monogram.height;
  const scale = size / Math.max(iw, ih);
  ctx.drawImage(monogram, w / 2 - (iw * scale) / 2, top + 136, iw * scale, ih * scale);
}

// image: the painting. nameLine: "Illustrated for …" in the guest's language.
// frame / monogram: your own artwork (optional). A custom frame replaces the built-in border and is drawn on top.
export function composePortrait(canvas, { image, guestName, message, nameLine, frame = null, monogram = null }) {
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  const w = CANVAS_WIDTH;
  const h = CANVAS_HEIGHT;

  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h);
  if (!frame) drawDoubleBorder(ctx, w, h, { outer: THEME.gold, inner: THEME.green });
  drawHeader(ctx, w);
  drawMessage(ctx, w, message);
  const frameBottom = drawPortraitFrame(ctx, w, image);
  drawFooter(ctx, w, frameBottom, nameLine || `Illustrated for ${guestName}`);
  if (monogram) drawMonogram(ctx, w, frameBottom, monogram);
  if (frame) ctx.drawImage(frame, 0, 0, w, h);
}
