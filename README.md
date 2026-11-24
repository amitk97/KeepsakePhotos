# KeepsakePhotos

A wedding keepsake studio for **Pooja & Amit** (April 2028). Guests scan a QR code, take a photo, add a message, and get a watercolour caricature of themselves, outfit and all, in a framed 4×6 keepsake they save to their phone.

👉 **To go live, follow [SETUP.md](SETUP.md)**: about 40 minutes, all in the browser.

**What it does**
- Free AI painting chain: Cloudflare Workers AI → FLUX Kontext on Modal → the phone paints a simpler watercolour itself if neither is available. Guests always get a portrait.
- English, Gujarati and Hindi; before/after slider; works with no signal once opened; add to home screen.
- Hosts' admin page: live status, studio on/off, wording and limits, style lab, wedding-day test, printable QR sign.
- Google Drive upload of finished keepsakes (off until connected).
- Accessible (WCAG 2.2 AA checks in the browser test); no build step; no npm dependencies.

## Run it on your computer

Needs **Node.js 22.9+**. No graphics card needed: the AI runs in the cloud.

```bash
cp .env.example .env      # fill in the values from SETUP.md (or leave empty to try the on-phone watercolour)
npm start                 # http://localhost:3000
npm run dev               # same, restarts when you change a file
```

Phone cameras need HTTPS. To try it on your phone: `cloudflared tunnel --url http://localhost:3000` and open the https link it prints.

## Settings

All in environment variables (Render → Environment, or `.env` locally). See `.env.example` for every option.

| Variable | Purpose |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Free first AI engine |
| `FLUX_ENDPOINT_URL`, `FLUX_API_TOKEN` | FLUX on Modal (second engine) |
| `UPSCALE_ENDPOINT_URL` | Optional upscaler for sharper prints |
| `IMAGE_PROVIDERS` | Engine order, e.g. `cloudflare,flux` (default: every engine with credentials, free first) |
| `ADMIN_PASSWORD` | Turns on `/admin` |
| `STUDIO_OPEN`, `DAILY_PORTRAIT_CAP`, `MAX_CONCURRENT`, `RATE_LIMIT_PER_HOUR` | Limits (also changeable on the admin page) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID` | Drive uploads, off until all four are set |
| `GEMINI_API_KEY` | Optional paid backup (add `gemini` to `IMAGE_PROVIDERS`) |
| `TRUST_PROXY=true` | On Render/Railway/Fly, so limits see guests' real addresses |
| `ALLOWED_ORIGIN` | Only accept requests from your own site |

`GET /api/health` shows which engines are set up. The site also runs anywhere Node or Docker runs (`Dockerfile` included); GitHub Pages can't be used because it can't keep keys secret.

## Project layout

```
server/
  index.js            starts the HTTP server
  app.js              routes: /api/generate, /api/health, static files
  config.js           reads environment variables
  routes/generate.js  validates the upload, rate-limits, returns the portrait
  providers/          cloudflare.js, flux.js, gemini.js, chain.js (automatic switching), errors.js
  prompts/            watercolour.js: the watercolour styles (picked in the admin style lab)
  providers/upscaler.js  doubles small paintings via Modal Real-ESRGAN
  lib/queue.js        place-in-line; lib/usage.js daily allowance counting
  gemini/client.js    Gemini REST client (timeouts, retries on 429/5xx only)
  gemini/caricature.js  describe outfit → paint caricature
  gemini/prompts.js   ← tune the AI wording here
  lib/                http, rate limiter, static files, settings store, admin sessions, problem log
  routes/admin.js     admin API + wedding-day test; routes/keepsake.js Drive upload hand-off
  drive/client.js     Google Drive uploads and settings backup (drive.file permission)
scripts/google-drive-auth.js   one-time Drive connection
flux-service/
  flux_app.py         FLUX Kontext + Real-ESRGAN upscaler on Modal (memory snapshots for fast starts)
  core.py             request checks (tested: python -m pytest flux-service)
  smoke_test.py       checks the live service after each deploy
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
npm test                         # 74 website tests, no keys needed
python -m pytest flux-service    # 11 AI service tests
python3 test/e2e/run_e2e.py      # whole guest journey in Chrome with fake AI engines (needs Playwright, Pillow, OpenCV)
```

The browser test covers the phone camera opening on the first tap, both AI engines and the fallback to the on-phone watercolour, languages, the slider, offline use, the admin page and style lab, the QR sign (decoded), and an accessibility audit of every page.

## Before the wedding

1. **Spending limit of $30 on Modal** (SETUP.md step 3), so nothing can ever charge you.
2. **Real-outfit test:** style lab with lehengas, sarees, sherwanis, suits and a group shot.
3. **Native speaker** checks `public/js/i18n/strings.js` (Gujarati and Hindi).
4. **Real phones:** an iPhone and an Android, opening the link in Safari or Chrome (in-app browsers like WhatsApp can block the camera).
5. Set the real date (admin page or `public/js/config.js`), add your frame and monogram (`public/frames/README.md`), print the QR sign.
6. On the day: SETUP.md → Wedding day.
