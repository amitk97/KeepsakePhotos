# Working on KeepsakePhotos

## Start here

1. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (5 minutes) for how the parts fit.
2. Find what you want to change in [docs/HOW-TO-CHANGE.md](docs/HOW-TO-CHANGE.md).
3. Run it on your computer: see "Run it on your computer" in the [README](README.md).

## Making a change

```bash
git pull
git checkout -b yourname/short-description
npm run dev                     # http://localhost:3000, restarts on save
# …make the change…
npm run check && npm test       # must pass
git add -A && git commit -m "Say what changed"
git push -u origin yourname/short-description
```

Open a pull request on GitHub. Tests run automatically; the other person reviews and merges. Merging to `main` puts it live: website changes in about a minute (Render), `flux-service/` changes in a few minutes (Modal).

## House rules

- **No secrets in the repo.** Keys live in `.env` (never committed), Render and Modal. The repo is public.
- **No guest photos in the repo**, including for testing. Use the admin page's style lab instead.
- **No build step, no npm packages.** Plain JavaScript modules that run as written. Small third-party files go in `public/vendor/` with their licence.
- **Every word guests see goes in `public/js/i18n/strings.js`**, in all three languages.
- **One job per file.** If a file starts doing two things, split it (see the folder rules in the architecture doc).
- **Add a test with each behaviour change.** Look at the nearest file in `test/` for the pattern.
- **Keep it accessible.** Use real buttons and labels; check text contrast. `npm run test:browser` audits every page.
- **Comments explain why**, in plain English, at the top of each file and above anything surprising.

## Style

Formatting follows `.editorconfig` (2 spaces, LF line endings). Names: `camelCase` for functions and variables, `createSomething()` for functions that build a part, `UPPER_CASE` for fixed settings.
