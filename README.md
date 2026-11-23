# KeepsakePhotos

A wedding keepsake studio for **Pooja & Amit**. Guests take or upload a photo, add a message, and get a hand-painted watercolour caricature (outfit and all) in a framed 4×6 keepsake they can save to their phone.

- **No dependencies:** plain Node.js server plus vanilla JavaScript modules. No build step.
- **API key stays secret:** the browser talks to this server, and only the server talks to Gemini.
- **Two-step AI:** Gemini first writes a detailed description of each outfit (colours, fabric, texture, embroidery, drape, jewellery), then paints the caricature using the photo and that description.

## Run it locally

Needs **Node.js 22.9+**.

```bash
cp .env.example .env      # then paste your key into GEMINI_API_KEY
npm start                 # http://localhost:3000
```

Get a key at <https://aistudio.google.com/apikey>.

> Phone cameras only work over **HTTPS** (or on `localhost`). To test on your phone, deploy it or use a tunnel such as `cloudflared tunnel --url http://localhost:3000`.

## Deploy

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
| `GEMINI_API_KEY` | ✅ | | Your Gemini key |
| `GEMINI_IMAGE_MODEL` | | `gemini-3.1-flash-image` | Model for both steps |
| `ALLOWED_ORIGIN` | | | e.g. `https://keepsake.example.com`; blocks other sites using your server |
| `RATE_LIMIT_PER_HOUR` | | `15` | Portraits per guest IP per hour |
| `TRUST_PROXY` | | `false` | Set `true` on Render/Railway/Fly so rate limits see real guest IPs |
| `PORT` | | `3000` | |

Check it's set up: `GET /api/health` returns `{"ok":true,"configured":true}`.

## Project layout

```
server/
  index.js            starts the HTTP server
  app.js              routes: /api/generate, /api/health, static files
  config.js           reads environment variables
  routes/generate.js  validates the upload, rate-limits, returns the portrait
  gemini/client.js    Gemini REST client (timeouts, retries on 429/5xx only)
  gemini/caricature.js  describe outfit → paint caricature
  gemini/prompts.js   ← tune the AI wording here
  lib/                http helpers, rate limiter, static file server
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
  js/portrait/        canvas layout (compose.js), shapes, text wrapping
test/
  *.test.js           unit + API tests (npm test)
  e2e/run_e2e.py      real-browser test with a fake Gemini
```

## Testing

```bash
npm test                         # 24 server & layout tests, no key needed
python3 test/e2e/run_e2e.py      # full guest journey in Chrome (needs Playwright + Pillow)
```

The browser test covers: phone "Take a Photo" opening the native camera on the first tap, photo resize, outfit notes reaching the painting prompt, canvas output, download, "Paint It Again", the error path returning to the form, and the laptop live camera.

## Before the wedding

1. **Set a spending cap** in Google AI Studio / Cloud billing. The link is public.
2. **Dry run with real outfits** (lehenga, sherwani, suits). If clothing isn't faithful enough, edit `server/gemini/prompts.js`, or try `GEMINI_IMAGE_MODEL=gemini-3-pro-image` for higher fidelity (slower and pricier).
3. **Test on an iPhone and an Android phone**, opening the link in Safari or Chrome. In-app browsers (WhatsApp, Instagram) can block the camera.
4. Put the link on a QR code at the venue.
