// Printable QR sign. The QR points at this site's own address (or the link typed in the box).

import QRCode, { QRErrorCorrectLevel } from "./qrcode.js";

const $ = (id) => document.getElementById(id);

const escapeXml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// QR code as an SVG (sharp at any print size), with the standard quiet border.
export function qrSvg(text) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const size = n + quiet * 2;
  let path = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${escapeXml(text)}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#1D3B2D"/></svg>`;
}

function render() {
  const url = $("url").value.trim() || `${location.origin}/`;
  const card = $("size").value === "card";
  const sheet = $("sheet");
  sheet.className = card ? "card" : "";
  sheet.replaceChildren();
  for (let i = 0; i < (card ? 4 : 1); i++) {
    const sign = $("signTpl").content.cloneNode(true);
    sign.querySelector(".qr").innerHTML = qrSvg(url);
    sign.querySelector(".link").textContent = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    sheet.append(sign);
  }
}

$("url").value = `${location.origin}/`;
$("url").addEventListener("input", render);
$("size").addEventListener("change", render);
$("printBtn").addEventListener("click", () => window.print());

// Use the names and venue line from the admin page, if changed there.
fetch("/api/settings", { cache: "no-store" })
  .then((r) => (r.ok ? r.json() : {}))
  .then((s) => {
    const tpl = $("signTpl").content;
    if (s.coupleNames) tpl.querySelector(".names").textContent = s.coupleNames;
    if (s.keepsakeVenueLine) tpl.querySelector(".venue").textContent = s.keepsakeVenueLine;
    render();
  })
  .catch(() => {});

render();
