// One-time Google Drive connection. Run on your own computer when you're ready:
//   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… node scripts/google-drive-auth.js
// It opens Google's sign-in, creates a "Pooja & Amit Wedding Keepsakes" folder in that account,
// and prints the GOOGLE_REFRESH_TOKEN and GOOGLE_DRIVE_FOLDER_ID to paste into Render.
// Permission asked for: drive.file, so the app can only see files and the folder it creates itself.

import http from "node:http";
import { randomBytes } from "node:crypto";

const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = process.env;
const FOLDER_NAME = process.env.FOLDER_NAME || "Pooja & Amit Wedding Keepsakes";
const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (see SETUP.md → Google Drive).");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
    state,
  });

async function exchange(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
  });
  const data = await res.json();
  if (!res.ok || !data.refresh_token) throw new Error(`Google said: ${JSON.stringify(data)}`);
  return data;
}

async function createFolder(accessToken) {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Couldn't create folder: ${JSON.stringify(data)}`);
  return data;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== "/callback") return res.writeHead(404).end();
  try {
    if (url.searchParams.get("state") !== state) throw new Error("State mismatch, please try again.");
    if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error"));
    const tokens = await exchange(url.searchParams.get("code"));
    const folder = await createFolder(tokens.access_token);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("Connected. You can close this tab and go back to the terminal.");
    console.log("\nConnected. Add these to Render → Environment (keep them secret):\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`GOOGLE_DRIVE_FOLDER_ID=${folder.id}`);
    console.log(`\nFolder: ${folder.webViewLink}`);
    console.log("Share that folder with your partner in Google Drive so you both see every keepsake.\n");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end(`Something went wrong: ${err.message}`);
    console.error(err.message);
  } finally {
    server.close();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Open this link in your browser and sign in with the Google account that should own the folder:\n");
  console.log(authUrl, "\n");
});
