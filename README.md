# KeepsakePhotos

A wedding keepsake studio for **Pooja & Amit**. Guests take or upload a photo, add a message, and get a hand-painted watercolour caricature (outfit and all) in a framed 4×6 keepsake they can save to their phone.

- **Runs entirely in the cloud:** the website on Render, and the AI (**FLUX.1 Kontext**, free open model) on a **Modal** serverless GPU that only runs, and only costs, while painting.
- **No per-image AI fees:** you pay for GPU seconds, not per portrait. Gemini can be added as an automatic backup.
- **Outfit-faithful:** FLUX Kontext edits the guest's photo, keeping colours, fabrics, embroidery and jewellery.
- **No dependencies:** plain Node.js server plus vanilla JavaScript modules. No build step.

👉 **New here? Follow [SETUP.md](SETUP.md)**: about 30 minutes, nothing to install.

## Run it locally

Needs **Node.js 22.9+**.

```bash
cp .env.example .env      # then paste your key into GEMINI_API_KEY
npm start                 # http://localhost:3000
```

Get a key at <https://aistudio.google.com/apikey>.

> Phone cameras only work over **HTTPS** (or on `localhost`). To test on your phone, deploy it or use a tunnel such as `cloudflared tunnel --url http://localhost:3000`.

## Deploy

Recommended: follow [SETUP.md](SETUP.md) (Render + Modal). Other hosts also work for the website:

GitHub Pages can't be used, because it can't keep the API key secret. Any host that runs Node or Docker works:

| Host | How |
|---|---|
| **Render** | New → Web Service → this repo. Build: *(none)*. Start: `npm start`. Add the env vars. |
| **Railway** | New project → deploy from GitHub repo. Add the env vars. |
| **Fly.io** | `fly launch` (uses the Dockerfile), then `fly secrets set GEMINI_API_KEY=...` |
| **Any VPS** | `docker build -t keepsake . && docker run -p 3000:3000 -e GEMINI_API_KEY=... keepsake`, behind HTTPS (Caddy/nginx) |

Environment variables (see `.env.example`):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `IMAGE_PROVIDERS` | | engines with credentials, free first | Engines tried in order, e.g. `cloudflare,flux` |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | | | Free Cloudflare Workers AI engine |
| `STUDIO_OPEN` | | `true` | `false` = on-phone watercolour only |
| `DAILY_PORTRAIT_CAP` | | `600` | AI portraits per day across all guests |
| `MAX_CONCURRENT` | | `4` | Portraits painted at once; others queue |
| `FLUX_ENDPOINT_URL` | ✅ (flux) | | Modal `generate` endpoint URL |
| `FLUX_API_TOKEN` | ✅ (flux) | | Shared secret, same as the Modal `keepsake-flux-auth` secret |
| `GEMINI_API_KEY` | ✅ (gemini) | | Gemini key, for Gemini mode or the backup |
| `GEMINI_IMAGE_MODEL` | | `gemini-3.1-flash-image` | Model for both steps |
| `ALLOWED_ORIGIN` | | | e.g. `https://keepsake.example.com`; blocks other sites using your server |
| `RATE_LIMIT_PER_HOUR` | | `15` | Portraits per guest IP per hour |
| `TRUST_PROXY` | | `false` | Set `true` on Render/Railway/Fly so rate limits see real guest IPs |
| `ADMIN_PASSWORD` | | | Turns on the admin page at `/admin` |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` / `GOOGLE_DRIVE_FOLDER_ID` | | | Google Drive uploads (off until all four set) |
| `SETTINGS_FILE` | | `data/settings.json` | Where admin-page settings are saved |
| `PORT` | | `3000` | |

Check it's set up: `GET /api/health` returns `{"ok":true,"configured":true}`.

## Project layout

```
server/
  index.js            starts the HTTP server
  app.js              routes: /api/generate, /api/health, static files
  config.js           reads environment variables
  routes/generate.js  validates the upload, rate-limits, returns the portrait
  providers/          cloudflare.js, flux.js, gemini.js, chain.js (automatic switching), errors.js
  prompts/            watercolour.js: the one art style
  lib/queue.js        place-in-line; lib/usage.js daily allowance counting
  gemini/client.js    Gemini REST client (timeouts, retries on 429/5xx only)
  gemini/caricature.js  describe outfit → paint caricature
  gemini/prompts.js   ← tune the AI wording here
  lib/                http, rate limiter, static files, settings store, admin sessions, problem log
  routes/admin.js     admin API + wedding-day test; routes/keepsake.js Drive upload hand-off
  drive/client.js     Google Drive uploads and settings backup (drive.file permission)
scripts/google-drive-auth.js   one-time Drive connection
flux-service/
  flux_app.py         FLUX Kontext on Modal (prompt, GPU, warm/scale settings)
.github/workflows/    deploy FLUX to Modal (button in Actions tab), run tests
render.yaml           one-click website setup on Render
public/
  index.html, css/styles.css, favicon.svg
  js/config.js        ← wedding names, date, preset messages, colours
  js/main.js          wires buttons (data-action="...") to features
  js/camera.js        native camera on phones, live preview on laptops
  js/photo.js         HEIC conversion + resize to 1536px JPEG
  js/api.js           calls /api/generate
  js/share.js         Save to Photos / Share, download
  js/storage.js       keeps name & message if the page reloads
  js/ui.js, state.js
  js/sketch/          free on-phone watercolour (last-resort backup)
  js/i18n/            English, Gujarati, Hindi: every word guests see (strings.js)
  js/compare.js       before/after slider
  js/design.js        loads your own frame and monogram (see frames/README.md)
  frames/             frame template and spec for your own artwork
  sw.js, manifest     offline support and "add to home screen"
  admin/              hosts' admin page
  sign/               printable QR sign (QR library: MIT, Kazuhiko Arase)
  js/portrait/        canvas layout (compose.js), shapes, text wrapping
test/
  *.test.js           unit + API tests (npm test)
  e2e/run_e2e.py      real-browser test with a fake Gemini
```

## Testing

```bash
npm test                         # 68 server, admin, Drive, engine-chain, translation & layout tests, no keys needed
python3 test/e2e/run_e2e.py      # full guest journey in Chrome (needs Playwright + Pillow)
```

The browser test covers: phone "Take a Photo" opening the native camera on the first tap, photo resize, outfit notes reaching the painting prompt, canvas output, download, "Paint It Again", the error path returning to the form, and the laptop live camera.

## Before the wedding

1. **Set a spending cap** in Google AI Studio / Cloud billing. The link is public.
2. **Dry run with real outfits** (lehenga, sherwani, suits). If clothing isn't faithful enough, edit `server/gemini/prompts.js`, or try `GEMINI_IMAGE_MODEL=gemini-3-pro-image` for higher fidelity (slower and pricier).
3. **Test on an iPhone and an Android phone**, opening the link in Safari or Chrome. In-app browsers (WhatsApp, Instagram) can block the camera.
4. Put the link on a QR code at the venue.
