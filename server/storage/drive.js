// Google Drive uploads, using the "drive.file" permission: the app can only see files and the
// folder it created itself, nothing else in your Drive.
// Switched off until GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN and
// GOOGLE_DRIVE_FOLDER_ID are set (scripts/google-drive-auth.js gets them; see SETUP.md).

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

  const configured = Boolean(clientId && clientSecret && refreshToken && folderId);

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

  // Multipart upload: file details + content in one request.
  async function upload({ name, mimeType, body, fileId = null }) {
    const boundary = `keepsake${now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const meta = fileId ? { name } : { name, parents: [folderId] };
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
    const q = encodeURIComponent(`name='keepsake-settings.json' and '${folderId}' in parents and trashed=false`);
    const res = await call(`${apiBase}/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
    settingsFileId = (await res.json()).files?.[0]?.id || null;
    return settingsFileId;
  }

  return {
    configured,

    // Just checks the sign-in works (wedding-day test).
    async check() {
      await accessToken();
      await call(`${apiBase}/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name`);
      return true;
    },

    uploadImage: (name, buffer, mimeType = "image/png") => upload({ name, mimeType, body: buffer }),

    // Settings backup, so changes from the admin page survive a server restart.
    settingsBackup: {
      name: "Google Drive",
      configured,
      async save(settings) {
        const id = await findSettingsFile();
        settingsFileId = await upload({ name: "keepsake-settings.json", mimeType: "application/json", body: JSON.stringify(settings, null, 2), fileId: id });
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
        await drive.uploadImage(job.name, job.buffer, job.mimeType);
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
    add(name, buffer, mimeType) {
      jobs.push({ name, buffer, mimeType, tries: 0 });
      work();
    },
    stats: () => ({ ...stats, pending: jobs.length }),
    idle: () => !running && jobs.length === 0,
  };
}
