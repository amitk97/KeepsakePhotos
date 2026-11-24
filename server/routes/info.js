// GET /api/health   → is it up, and which engines are set up (for you and for monitoring)
// GET /api/settings → wording the hosts changed on the admin page (for guests' phones; nothing private)

import { sendJson } from "../lib/http.js";

export function createHealthHandler({ engines, settings, portraitsToday, drive, upscaler }) {
  return (req, res) => {
    const s = settings.get();
    return sendJson(res, 200, {
      ok: true,
      provider: engines.name,
      configured: engines.configured,
      studioOpen: s.studioOpen,
      portraitsToday: portraitsToday.get(),
      dailyCap: s.dailyPortraitCap,
      engines: engines.status(),
      driveConnected: drive.configured,
      upscaler: upscaler.configured,
    });
  };
}

export function createPublicSettingsHandler({ settings, drive }) {
  return (req, res) => sendJson(res, 200, settings.publicView({ uploadsEnabled: drive.configured }));
}
