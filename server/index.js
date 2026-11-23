// Entry point: `npm start`

import http from "node:http";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

const config = loadConfig();
const server = http.createServer(createApp(config));

// Portrait requests can take up to a minute or two.
server.requestTimeout = 180_000;
server.headersTimeout = 60_000;

server.listen(config.port, config.host, () => {
  console.log(`Keepsake studio running on http://localhost:${config.port}`);
  if (!config.geminiApiKey) console.warn("Warning: GEMINI_API_KEY is not set, so portraits will fail.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
