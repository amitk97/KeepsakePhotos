// Entry point: `npm start`

import http from "node:http";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

const config = loadConfig();
const server = http.createServer(createApp(config));

// Portrait requests can take up to a minute or two.
server.requestTimeout = 300_000; // FLUX cold start + painting
server.headersTimeout = 60_000;

server.listen(config.port, config.host, () => {
  console.log(`Keepsake studio running on http://localhost:${config.port}`);
  console.log(`Image provider: ${config.imageProvider}${config.imageFallback ? ` (backup: ${config.imageFallback})` : ""}`);
  if (config.imageProvider === "flux" && !(config.fluxEndpointUrl && config.fluxApiToken))
    console.warn("Warning: FLUX_ENDPOINT_URL / FLUX_API_TOKEN not set, so portraits will fail.");
  if (config.imageProvider === "gemini" && !config.geminiApiKey)
    console.warn("Warning: GEMINI_API_KEY is not set, so portraits will fail.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
