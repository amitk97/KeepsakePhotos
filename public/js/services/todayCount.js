// "12 keepsakes painted today" on the welcome page. Needs the full server (it keeps the count);
// on a site with no server, such as the GitHub Pages test site, the line simply stays hidden.

import { deviceId } from "./api.js";

export async function fetchTodayCount() {
  try {
    const res = await fetch("api/count", { cache: "no-store" });
    if (!res.ok) return null;
    const { today } = await res.json();
    return Number.isInteger(today) ? today : null;
  } catch {
    return null;
  }
}

// Tell the server a free artist painted one from this phone, so it counts too.
export function reportPainted() {
  fetch("api/painted", { method: "POST", headers: { "X-Device-Id": deviceId() } }).catch(() => {});
}
