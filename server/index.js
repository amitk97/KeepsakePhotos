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
  console.log(`Image engines, in order: ${config.imageProviders.join(" → ")} → on-phone watercolour`);
  if (!config.studioOpen) console.warn("STUDIO_OPEN=false: guests get the on-phone watercolour only.");
  console.log(config.adminPassword ? "Admin page: /admin" : "Admin page off (set ADMIN_PASSWORD to turn it on).");
  const drive = [config.googleClientId, config.googleClientSecret, config.googleRefreshToken, config.googleDriveFolderId];
  console.log(drive.every(Boolean) ? "Google Drive uploads: on" : "Google Drive uploads: off (not connected)");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
