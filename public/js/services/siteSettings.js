// Fetches wording the hosts changed on the admin page and applies it.
// If the server can't be reached (e.g. offline), the built-in wording is used.

import { WEDDING } from "../config.js";
import { setOverrides } from "../i18n/index.js";
import { deviceId } from "./api.js";
import { DEFAULT_STYLE, promptFor } from "../ai/styles.js";

let uploadsEnabled = false;
let styleVariant = DEFAULT_STYLE;

// The instructions for the AI: the style chosen in the admin page's style lab, or the default.
export function stylePrompt(background) {
  return promptFor(styleVariant, background);
}

export async function loadSiteSettings() {
  let s;
  try {
    const res = await fetch("api/settings", { cache: "no-store" });
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
  if (s.styleVariant) styleVariant = s.styleVariant;
}

// Sends the finished keepsake to the hosts' shared folder. Does nothing until Google Drive is connected.
// ticket: the one-time keepsakeTicket the server sent with the portrait (or with the "use the phone" reply).
export async function sendKeepsakeToHosts(canvas, guestName, ticket) {
  if (!uploadsEnabled || !ticket) return;
  try {
    await fetch("api/keepsake", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId() },
      body: JSON.stringify({ image: canvas.toDataURL("image/png"), guestName, ticket }),
      keepalive: false,
    });
  } catch {
    // never bother the guest about this
  }
}
