// Canvas drawing helpers for the keepsake frame.

export function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawSpeechBubble(ctx, { x, y, w, h, radius = 20, fill, stroke }) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(0,0,0,0.06)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;

  const px = x + w / 2; // pointer points down at the portrait
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(px + 20, y + h);
  ctx.lineTo(px, y + h + 24);
  ctx.lineTo(px - 20, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.stroke();
  ctx.restore();
}

export function drawDoubleBorder(ctx, width, height, { outer, inner }) {
  ctx.save();
  ctx.strokeStyle = outer;
  ctx.lineWidth = 8;
  ctx.strokeRect(30, 30, width - 60, height - 60);
  ctx.strokeStyle = inner;
  ctx.lineWidth = 4;
  ctx.strokeRect(46, 46, width - 92, height - 92);

  ctx.strokeStyle = outer;
  ctx.lineWidth = 2;
  const corners = [
    [54, 54, 1, 1],
    [width - 54, 54, -1, 1],
    [54, height - 54, 1, -1],
    [width - 54, height - 54, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + 20 * dy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + 20 * dx, cy);
    ctx.stroke();
  }
  ctx.restore();
}

// Draws an image to fill a box, cropping the overflow (like CSS object-fit: cover).
// Fills the box with the image. If it has to trim, it trims mostly from the bottom
// (anchorY 0.15 = 15% of the trim at the top), so heads are kept and feet go first.
export function drawImageCover(ctx, img, x, y, w, h, anchorY = 0.15) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x - (dw - w) / 2, y - (dh - h) * anchorY, dw, dh);
}
