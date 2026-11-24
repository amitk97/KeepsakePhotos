// Settings the hosts can change from the admin page, without touching code.
// Saved to a file on the server, and backed up to Google Drive once that is connected
// (Render's free plan forgets files when the server restarts; Drive keeps them).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const LANG_CODES = ["en", "gu", "hi"];
const TEXT_MAX = 80;
const PRESET_MAX = 60;

export function defaultSettings(config) {
  return {
    studioOpen: config.studioOpen,
    dailyPortraitCap: config.dailyPortraitCap,
    // null = use the wording built into the app
    coupleNames: null,
    keepsakeVenueLine: null,
    keepsakeFooterLine: null,
    siteVenueLine: { en: null, gu: null, hi: null },
    presets: { en: null, gu: null, hi: null },
  };
}

function text(v, max = TEXT_MAX) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

// Cleans a patch from the admin page; unknown fields are ignored.
export function cleanPatch(patch = {}) {
  const out = {};
  if ("studioOpen" in patch) out.studioOpen = Boolean(patch.studioOpen);
  if ("dailyPortraitCap" in patch) {
    const n = Number.parseInt(patch.dailyPortraitCap, 10);
    if (!Number.isFinite(n) || n < 0 || n > 100_000) throw new Error("Daily cap must be a number from 0 to 100000.");
    out.dailyPortraitCap = n;
  }
  for (const k of ["coupleNames", "keepsakeVenueLine", "keepsakeFooterLine"]) if (k in patch) out[k] = text(patch[k]);
  if (patch.siteVenueLine && typeof patch.siteVenueLine === "object") {
    out.siteVenueLine = {};
    for (const l of LANG_CODES) if (l in patch.siteVenueLine) out.siteVenueLine[l] = text(patch.siteVenueLine[l]);
  }
  if (patch.presets && typeof patch.presets === "object") {
    out.presets = {};
    for (const l of LANG_CODES) {
      if (!(l in patch.presets)) continue;
      const list = patch.presets[l];
      if (list === null) out.presets[l] = null;
      else if (Array.isArray(list)) {
        const cleaned = list.map((m) => text(m, PRESET_MAX)).filter(Boolean).slice(0, 6);
        out.presets[l] = cleaned.length ? cleaned : null;
      }
    }
  }
  return out;
}

function merge(base, patch) {
  const next = { ...base, ...patch };
  for (const k of ["siteVenueLine", "presets"]) if (patch[k]) next[k] = { ...base[k], ...patch[k] };
  return next;
}

export function createSettingsStore({ defaults, file = "", backup = null, logger = console }) {
  let current = structuredClone(defaults);

  async function save() {
    if (file) {
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(current, null, 2));
      } catch (err) {
        logger.warn("Couldn't save settings file:", err.message);
      }
    }
    if (backup?.configured) {
      try {
        await backup.save(current);
      } catch (err) {
        logger.warn("Couldn't back up settings to Google Drive:", err.message);
      }
    }
  }

  return {
    get: () => current,

    // Loads the saved file, or the Drive backup if the file is gone.
    async load() {
      let saved = null;
      if (file) {
        try {
          saved = JSON.parse(await readFile(file, "utf8"));
        } catch {
          // no file yet
        }
      }
      if (!saved && backup?.configured) {
        try {
          saved = await backup.load();
        } catch (err) {
          logger.warn("Couldn't load settings from Google Drive:", err.message);
        }
      }
      if (saved) {
        try {
          current = merge(current, cleanPatch(saved));
        } catch (err) {
          logger.warn("Ignoring bad saved settings:", err.message);
        }
      }
      return current;
    },

    async update(patch) {
      current = merge(current, cleanPatch(patch));
      await save();
      return current;
    },

    // What guests' phones need (nothing private).
    publicView(extra = {}) {
      const { coupleNames, keepsakeVenueLine, keepsakeFooterLine, siteVenueLine, presets } = current;
      return { coupleNames, keepsakeVenueLine, keepsakeFooterLine, siteVenueLine, presets, ...extra };
    },
  };
}
