// Google Drive uploads, using the "drive.file" permission: the app can only see files and the
// folder it created itself, nothing else in your Drive.
// Switched off until GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN are set (SETUP.md).
// Folders: "Pooja & Amit Wedding Keepsakes" with "Keepsakes" and "Original photos" inside, each with a
// folder per day (e.g. "2028-04-15"). The app creates
// them itself on first use (with drive.file it can only use folders it made). GOOGLE_DRIVE_FOLDER_ID is
// optional: the main folder's ID, if it was made by this app before (e.g. by scripts/google-drive-auth.js).

// Inside "Keepsakes" and "Original photos", one folder per day, e.g. "2028-04-15", made the first
// time something is saved that day (UK date, so it sorts in order).
export function dayFolderName(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export const FOLDER_NAMES = { main: "Pooja & Amit Wedding Keepsakes", keepsakes: "Keepsakes", originals: "Original photos" };
const FOLDER_TYPE = "application/vnd.google-apps.folder";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class DriveError extends Error {}

export function createDriveClient({
  clientId,
  clientSecret,
  refreshToken,
  folderId,
  apiBase = "https://www.googleapis.com",
  tokenUrl = TOKEN_URL,
  fetchImpl = fetch,
  timeoutMs = 60_000,
  now = () => Date.now(),
}) {
  let token = null;
  let tokenExpires = 0;
  let settingsFileId = null;
  let folders = null; // { main, keepsakes, originals } once found or made
  const dayFolders = new Map(); // "keepsakes/2028-04-15" → folder id

  const configured = Boolean(clientId && clientSecret && refreshToken);

  async function accessToken() {
    if (token && now() < tokenExpires - 60_000) return token;
    const res = await fetchImpl(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new DriveError(`Google sign-in failed (${res.status} ${data.error || ""})`.trim());
    token = data.access_token;
    tokenExpires = now() + (data.expires_in || 3600) * 1000;
    return token;
  }

  async function call(url, opts = {}) {
    const res = await fetchImpl(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${await accessToken()}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new DriveError(`Google Drive ${res.status}: ${detail}`);
    }
    return res;
  }

  const escape = (text) => text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  async function findOrCreateFolder(name, parent) {
    const q = encodeURIComponent(`name='${escape(name)}' and mimeType='${FOLDER_TYPE}' and '${parent}' in parents and trashed=false`);
    const found = (await (await call(`${apiBase}/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`)).json()).files?.[0];
    if (found) return found.id;
    const res = await call(`${apiBase}/drive/v3/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_TYPE, parents: [parent] }),
    });
    return (await res.json()).id;
  }

  let folderPromise = null;
  function getFolders() {
    if (folders) return Promise.resolve(folders);
    folderPromise ||= (async () => {
      const main = folderId || (await findOrCreateFolder(FOLDER_NAMES.main, "root"));
      const keepsakes = await findOrCreateFolder(FOLDER_NAMES.keepsakes, main);
      const originals = await findOrCreateFolder(FOLDER_NAMES.originals, main);
      folders = { main, keepsakes, originals };
      return folders;
    })().finally(() => {
      folderPromise = null;
    });
    return folderPromise;
  }

  // Multipart upload: file details + content in one request.
  async function upload({ name, mimeType, body, fileId = null, parent }) {
    const boundary = `keepsake${now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const meta = fileId ? { name } : { name, parents: [parent] };
    const head = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--`);
    const url = fileId
      ? `${apiBase}/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id`
      : `${apiBase}/upload/drive/v3/files?uploadType=multipart&fields=id`;
    const res = await call(url, {
      method: fileId ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: Buffer.concat([head, Buffer.from(body), tail]),
    });
    return (await res.json()).id;
  }

  async function findSettingsFile() {
    if (settingsFileId) return settingsFileId;
    const { main } = await getFolders();
    const q = encodeURIComponent(`name='keepsake-settings.json' and '${main}' in parents and trashed=false`);
    const res = await call(`${apiBase}/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
    settingsFileId = (await res.json()).files?.[0]?.id || null;
    return settingsFileId;
  }

  return {
    configured,

    // Just checks the sign-in works (wedding-day test).
    async check() {
      await accessToken();
      const { main } = await getFolders();
      await call(`${apiBase}/drive/v3/files/${encodeURIComponent(main)}?fields=id,name`);
      return true;
    },

    // kind: "keepsakes" (finished caricatures) or "originals" (guests' own photos)
    async uploadImage(name, buffer, mimeType = "image/png", kind = "keepsakes") {
      const f = await getFolders();
      const parent = f[kind] || f.keepsakes;
      const day = dayFolderName(new Date(now()));
      const key = `${parent}/${day}`;
      if (!dayFolders.has(key)) dayFolders.set(key, await findOrCreateFolder(day, parent));
      return upload({ name, mimeType, body: buffer, parent: dayFolders.get(key) });
    },

    // Settings backup, so changes from the admin page survive a server restart.
    settingsBackup: {
      name: "Google Drive",
      configured,
      async save(settings) {
        const id = await findSettingsFile();
        const { main } = await getFolders();
        settingsFileId = await upload({ name: "keepsake-settings.json", mimeType: "application/json", body: JSON.stringify(settings, null, 2), fileId: id, parent: main });
      },
      async load() {
        const id = await findSettingsFile();
        if (!id) return null;
        const res = await call(`${apiBase}/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
        return res.json();
      },
    },
  };
}

// Uploads one at a time in the background, retrying a few times, and keeps counts for the admin page.
export function createUploadQueue(drive, { logger = console, attempts = 3, retryDelayMs = 5000 } = {}) {
  const jobs = [];
  const stats = { uploaded: 0, failed: 0, lastError: null, lastUploadAt: null };
  let running = false;

  async function work() {
    if (running) return;
    running = true;
    while (jobs.length) {
      const job = jobs[0];
      try {
        await drive.uploadImage(job.name, job.buffer, job.mimeType, job.kind);
        stats.uploaded++;
        stats.lastUploadAt = new Date().toISOString();
        jobs.shift();
      } catch (err) {
        job.tries++;
        logger.warn(`Drive upload failed (${job.name}, try ${job.tries}): ${err.message}`);
        if (job.tries >= attempts) {
          stats.failed++;
          stats.lastError = err.message;
          jobs.shift();
        } else {
          await new Promise((r) => setTimeout(r, retryDelayMs * job.tries));
        }
      }
    }
    running = false;
  }

  return {
    add(name, buffer, mimeType, kind = "keepsakes") {
      jobs.push({ name, buffer, mimeType, kind, tries: 0 });
      work();
    },
    stats: () => ({ ...stats, pending: jobs.length }),
    idle: () => !running && jobs.length === 0,
  };
}
