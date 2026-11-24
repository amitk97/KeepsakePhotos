// Keeps admin-page settings permanently in your Modal account (the `settings` endpoint in
// flux-service/flux_app.py, backed by a Modal Dict). Render's free plan forgets files on restart;
// this doesn't. Off until SETTINGS_ENDPOINT_URL is set; uses the same FLUX_API_TOKEN.

export function createModalSettingsBackup({ endpointUrl, apiToken, timeoutMs = 20_000, fetchImpl = fetch }) {
  const configured = Boolean(endpointUrl && apiToken);

  async function call(body) {
    const res = await fetchImpl(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Modal settings store ${res.status}`);
    return data;
  }

  return {
    name: "modal",
    configured,
    save: (settings) => call({ action: "put", settings }),
    load: async () => (await call({ action: "get" })).settings || null,
  };
}
