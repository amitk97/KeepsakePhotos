# KeepsakePhotos

A wedding keepsake studio for **Pooja & Amit** (April 2028). Guests scan a QR code, take a photo, add a message, and get a watercolour caricature of themselves, outfit and all, in a framed 4×6 keepsake they save to their phone.

👉 **To go live, follow [SETUP.md](SETUP.md)**: about 40 minutes, all in the browser.

**What it does**
- Free AI painting chain: Cloudflare Workers AI → FLUX Kontext on Modal → the phone paints a simpler watercolour itself if neither is available. Guests always get a portrait.
- English, Gujarati and Hindi; before/after slider; works with no signal once opened; add to home screen.
- Hosts' admin page: live status, studio on/off, wording and limits, style lab, wedding-day test, printable QR sign.
- Google Drive upload of finished keepsakes (off until connected).
- Accessible (WCAG 2.2 AA checks in the browser test); fonts hosted with the site; no build step; no npm dependencies.

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
| `STUDIO_OPEN`, `DAILY_PORTRAIT_CAP` | Studio switch and daily cap (also on the admin page) |
| `MAX_CONCURRENT`, `MAX_WAITING` | Painted at once; most in line before guests get the on-phone watercolour |
| `RATE_LIMIT_PER_HOUR`, `RATE_LIMIT_PER_IP_HOUR` | Per phone, and per internet address (generous, as venue Wi-Fi shares one) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID` | Drive uploads, off until all four are set |
| `SETTINGS_ENDPOINT_URL` | Keeps admin-page settings permanently (Modal settings store) |
| `GEMINI_API_KEY` | Optional paid backup (add `gemini` to `IMAGE_PROVIDERS`) |
| `TRUST_PROXY=true` | On Render/Railway/Fly, so limits see guests' real addresses |
| `ALLOWED_ORIGIN` | Only accept requests from your own site |

`GET /api/health` shows which engines are set up. The site also runs anywhere Node or Docker runs (`Dockerfile` included); GitHub Pages can't be used because it can't keep keys secret.

## Finding your way around

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):** how the parts fit, with a diagram and a map of every folder.
- **[docs/HOW-TO-CHANGE.md](docs/HOW-TO-CHANGE.md):** "I want to change X" → the exact file.
- **[CONTRIBUTING.md](CONTRIBUTING.md):** how to make a change safely, and the house rules.

```
public/          the pages guests and hosts see (no build step)
server/          small Node server: routes/, engines/ (AI), storage/, lib/
flux-service/    FLUX painter, upscaler and settings store on Modal
docs/            architecture and how-to guides
test/            automated tests (+ e2e/ browser test)
```

## Testing

```bash
npm run check          # every JavaScript file parses
npm test               # 87 server, engine, storage, translation and import-matching tests
npm run test:ai        # 14 tests for the Modal service, including loading it the way a deploy does
npm run test:browser   # whole guest journey in Chrome with fake AI engines (needs Playwright, Pillow, OpenCV)
npm run test:all       # everything
```

The browser test covers the phone camera, both AI engines and the on-phone fallback, languages, the slider, offline use, the admin page and style lab, the QR sign (decoded), an accessibility audit of every page, and that the security policy blocks nothing.

## Before the wedding

1. **Spending limit of $30 on Modal** (SETUP.md step 3), so nothing can ever charge you.
2. **Real-outfit test:** style lab with lehengas, sarees, sherwanis, suits and a group shot.
3. **Native speaker** checks `public/js/i18n/strings.js` (Gujarati and Hindi).
4. **Real phones:** an iPhone and an Android, opening the link in Safari or Chrome (in-app browsers like WhatsApp can block the camera).
5. Set the real date (admin page or `public/js/config.js`), add your frame and monogram (`public/frames/README.md`), print the QR sign.
6. On the day: SETUP.md → Wedding day.
