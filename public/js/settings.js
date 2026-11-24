// Fetches wording the hosts changed on the admin page and applies it.
// If the server can't be reached (e.g. offline), the built-in wording is used.

import { WEDDING } from "./config.js";
import { setOverrides } from "./i18n/index.js";

let uploadsEnabled = false;

export async function loadSiteSettings() {
  let s;
  try {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (!res.ok) return;
    s = await res.json();
  } catch {
    return;
  }

  if (s.coupleNames) WEDDING.coupleNames = s.coupleNames;
  if (s.keepsakeVenueLine) WEDDING.venueLine = s.keepsakeVenueLine;
  if (s.keepsakeFooterLine) WEDDING.footerLine = s.keepsakeFooterLine;

  const overrides = {};
  for (const lang of ["en", "gu", "hi"]) {
    const o = {};
    if (s.siteVenueLine?.[lang]) o.venueLine = s.siteVenueLine[lang];
    if (s.presets?.[lang]?.length) o.presets = s.presets[lang];
    if (Object.keys(o).length) overrides[lang] = o;
  }
  setOverrides(overrides);
  uploadsEnabled = Boolean(s.uploadsEnabled);
}

// Sends the finished keepsake to the hosts' shared folder. Does nothing until Google Drive is connected.
export async function sendKeepsakeToHosts(canvas, guestName) {
  if (!uploadsEnabled) return;
  try {
    await fetch("/api/keepsake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: canvas.toDataURL("image/png"), guestName }),
      keepalive: false,
    });
  } catch {
    // never bother the guest about this
  }
}
