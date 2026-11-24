# How to change things

Each recipe names the exact file. After any change: `npm run check && npm test`, then try it with `npm run dev`.

## Wording and details

| I want to change… | Where |
|---|---|
| Couple names, venue/date line, bottom line on keepsakes | Admin page → *Wording and limits* (no code). Permanent default: `WEDDING` in `public/js/config.js` |
| Any text guests read (buttons, tips, errors, messages) | `public/js/i18n/strings.js`: change it in all three languages |
| Message suggestions | Admin page, or `presets` in `public/js/i18n/strings.js` |
| The wedding date | Admin page (keepsake and website lines), or `config.js` + `venueLine` in `strings.js` |
| The QR sign wording | `public/sign/index.html` |

## Look and feel

| I want to change… | Where |
|---|---|
| Colours | `:root` at the top of `public/css/styles.css`, and `THEME` in `public/js/config.js` (keepsake) |
| Fonts | `public/css/fonts.css` (files in `public/fonts/`) |
| The keepsake layout (positions, sizes) | `public/js/portrait/compose.js` |
| Use our own frame or monogram | See `public/frames/README.md`, then set `DESIGN` in `public/js/config.js` |
| The painting style / AI instructions | `public/js/ai/styles.js` |
| Which free Hugging Face artists are tried, and in what order | `public/js/ai/spaces.js` |

## The AI

| I want to… | Where |
|---|---|
| Change how portraits are painted | `server/engines/styles.js`: edit a style's `prompt`, then try it in the admin page's style lab |
| Add a new watercolour style | Add an entry to `STYLE_VARIANTS` in `server/engines/styles.js`. It appears in the style lab automatically |
| Change which engine goes first | `IMAGE_PROVIDERS` on Render, e.g. `flux,cloudflare` |
| Change FLUX settings (steps, size, GPU) | Top of `flux-service/flux_app.py`, then GitHub → Actions → Deploy FLUX to Modal |
| Add a new AI engine | 1. Copy `server/engines/flux.js` to a new file with `createCaricature()` and `configured`. 2. Add a branch for it in `buildProvider` in `server/engines/index.js`. 3. Add its settings in `server/config.js`. 4. Add tests like `test/providers.test.js` |

## Limits and behaviour

| I want to change… | Where |
|---|---|
| Daily cap, studio on/off | Admin page |
| Portraits per phone per hour, queue length, how many painted at once | Render settings: `RATE_LIMIT_PER_HOUR`, `MAX_WAITING`, `MAX_CONCURRENT` (defaults in `server/config.js`) |
| Photo size sent to the AI | `maxPhotoEdge` in `public/js/config.js` |
| Wait times and progress messages | `SETTINGS` in `public/js/config.js`; messages are `progress` in `strings.js` |

## Adding things

| I want to add… | How |
|---|---|
| A new button | Add `data-action="my-thing"` in `public/index.html`, write the function in the right `public/js/flows/` file, add it to `actions` in `public/js/main.js` |
| A new language | Add it to `LANGUAGES` and a full copy of the `en` block in `public/js/i18n/strings.js` (the tests check every key exists), plus a button in the `lang-switch` in `index.html` |
| A new server address | Write a handler in `server/routes/`, add a line in `server/router.js`, add anything it needs in `server/services.js` |
| A new setting on the admin page | Add the field in `defaultSettings` and `cleanPatch` (`server/storage/settings.js`), a box in `public/admin/index.html`, and read/save it in `public/admin/admin.js` |
| A new page file | Put it in `public/` and add it to `SHELL` in `public/sw.js` (a test reminds you), then bump `CACHE` |

## Checks

| Command | What it checks |
|---|---|
| `npm run check` | Every JavaScript file parses |
| `npm test` | Server, engines, admin, storage, translations, and that every import matches a real export |
| `npm run test:ai` | The Modal service's request handling, and that it loads the way a deploy does |
| `npm run test:browser` | The whole guest journey in Chrome with fake AI engines, plus accessibility and security checks |
| `npm run test:all` | All of the above |

GitHub runs the first three on every push.
