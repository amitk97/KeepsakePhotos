# Setup guide (all in the cloud, about 30 minutes)

You'll create 4 free accounts and copy a few values between them. Nothing to install on your computer.

**How portraits get painted:** Cloudflare (free daily allowance) → Modal FLUX (free monthly credit) → if both are unavailable, the guest's own phone paints a simpler watercolour. Guests always get a portrait.

| Service | What it does | Cost |
|---|---|---|
| **Cloudflare** | First AI painter: FLUX.2 Klein, free ~80 portraits/day | Free, no card |
| **Hugging Face** | Where the free FLUX model is downloaded from | Free |
| **Modal** | Runs FLUX on a cloud GPU only when a guest makes a portrait | Pay per second of GPU use (Modal includes some free credit each month) |
| **Render** | Hosts the website: the link you send guests | Free plan; ~$7/month "Starter" avoids sleeping |

---

## 1. Hugging Face: get access to FLUX

1. Sign up at <https://huggingface.co/join>.
2. Open <https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev> and click **Agree and access repository** (free; non-commercial licence, fine for a private wedding).
3. Go to **Settings → Access Tokens → Create new token** → type **Read** → create. Copy it (starts `hf_`). This is **value ①**.

## 2. Make a secret password for your services

Make a long random string (e.g. from <https://www.random.org/strings/>, or mash the keyboard for 40+ characters). This is **value ②** (`FLUX_API_TOKEN`). It stops strangers using your GPU.

## 3. Modal: the GPU service

1. Sign up at <https://modal.com> with your GitHub account, and add a payment card under **Settings → Billing**. Set a **spending limit** there too.
2. **Secrets → Create new secret → Hugging Face** type (or Custom):
   - Name: `huggingface-secret`
   - Key `HF_TOKEN` = value ①
3. **Secrets → Create new secret → Custom**:
   - Name: `keepsake-flux-auth`
   - Key `FLUX_API_TOKEN` = value ②
4. **Settings → API Tokens → New token.** Copy the **Token ID** and **Token Secret**.

## 4. GitHub: let it deploy to Modal

1. In this repo: **Settings → Secrets and variables → Actions → New repository secret**, twice:
   - `MODAL_TOKEN_ID` = Token ID from step 3.4
   - `MODAL_TOKEN_SECRET` = Token Secret from step 3.4
2. **Actions** tab → **Deploy FLUX to Modal** → **Run workflow** (warm = 0) → wait about 3 minutes for the green tick.
3. In Modal, open **Apps → keepsake-flux**. Copy the URL of the `generate` endpoint (looks like `https://YOURNAME--keepsake-flux-caricaturist-generate.modal.run`). This is **value ③**.
   Also copy the `upscale` endpoint (`…-upscaler-upscale.modal.run`). This is **value ⑥** (optional: makes Cloudflare's slightly smaller paintings print sharply).
4. Optional, so GitHub checks the live service after every deploy: add three more repository secrets, `FLUX_ENDPOINT_URL` = value ③, `FLUX_API_TOKEN` = value ②, `UPSCALE_ENDPOINT_URL` = value ⑥. Each check paints one test portrait (a few cents of credit).

## 4b. Cloudflare: the free first painter

1. Sign up at <https://dash.cloudflare.com/sign-up> (free plan, no card).
2. Copy your **Account ID** (right-hand side of the dashboard home, or under *Workers & Pages*). This is **value ④**.
3. **My Profile → API Tokens → Create Token →** use the **"Workers AI"** template → Create. Copy it. This is **value ⑤**.

## 5. Render: the website

1. Sign up at <https://render.com> with GitHub.
2. **New → Blueprint** → choose `KeepsakePhotos`. Render reads `render.yaml`.
3. When asked, fill in:
   - `FLUX_ENDPOINT_URL` = value ③
   - `FLUX_API_TOKEN` = value ②
   - `CLOUDFLARE_ACCOUNT_ID` = value ④
   - `CLOUDFLARE_API_TOKEN` = value ⑤
   - `UPSCALE_ENDPOINT_URL` = value ⑥ (optional)
   - `ADMIN_PASSWORD` = a password for your admin page (choose your own; don't reuse one)
   - Leave the four `GOOGLE_…` boxes empty for now
4. Deploy. Your guest link is at the top, e.g. `https://keepsakephotos.onrender.com`.
5. Check it: open `https://…onrender.com/api/health`. It should list `cloudflare` and `flux` under `engines`, each with `"configured":true`.

## 6. First test

Open the link on your phone and make a portrait. **The very first one takes several minutes** (Modal downloads the ~30 GB model once and saves it). After that, a cold start is about 1–2 minutes and a warm portrait about 15–30 seconds.

Try 10–20 photos with real outfits, using the admin page's **style lab** to compare styles. To write your own style, edit `server/prompts/watercolour.js`.

The first start after a deploy takes a few minutes (Modal downloads the model and saves a memory snapshot); later cold starts restore the snapshot and are much quicker.

---

## Admin page

Open `https://…onrender.com/admin` and log in with `ADMIN_PASSWORD`. From there you can:
- see portraits made today, the queue, each AI engine's status and free allowance left, and recent problems;
- switch the AI studio off (guests then get the on-phone watercolour);
- change the daily cap, the names and lines printed on keepsakes, the website venue line and the message suggestions in all three languages;
- run the **wedding-day test** (paints one test portrait per engine and checks Drive);
- use the **style lab**: upload a real photo, see it in each watercolour style (Classic soft, Rich fabric detail, Loose and airy, Storybook) and pick the one every guest gets;
- open the **printable QR sign** (A4 poster or 4 table cards).

Settings are saved on the server. On Render's free plan they're lost when the server restarts, until Google Drive is connected (they're then backed up there). For anything permanent before then, change `public/js/config.js` or `public/js/i18n/strings.js`.

## Later: connect Google Drive (optional)

Every finished keepsake is then uploaded to a shared folder. Until this is done, nothing is uploaded.

1. Go to <https://console.cloud.google.com>, create a project (e.g. "Wedding keepsake").
2. **APIs & Services → Library →** enable **Google Drive API**.
3. **OAuth consent screen:** choose *External*, fill in the app name and your email, add the scope `…/auth/drive.file`, then set **Publishing status → In production**. (In "Testing" mode Google expires the connection after 7 days. `drive.file` is a non-sensitive scope, so no Google review is needed.)
4. **Credentials → Create credentials → OAuth client ID →** type **Desktop app**. Copy the client ID and secret.
5. On a computer with Node 22 and this repo:
   ```bash
   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… node scripts/google-drive-auth.js
   ```
   Open the link it prints, sign in with the Google account that should own the folder, and allow access. It creates a **"Pooja & Amit Wedding Keepsakes"** folder and prints `GOOGLE_REFRESH_TOKEN` and `GOOGLE_DRIVE_FOLDER_ID`.
6. Add all four `GOOGLE_…` values in Render → Environment. The admin page should then say **Connected**.
7. In Google Drive, share the folder with your partner.

The app can only see files and the folder it created, nothing else in your Drive.

## Wedding day checklist

- [ ] **~1 hour before:** Actions → Deploy FLUX to Modal → Run workflow with **warm = 1** (or 2 for a big crowd). Portraits are now instant-start; you pay for that GPU by the hour.
- [ ] Render: switch the service to the **Starter** plan so the site never sleeps.
- [ ] Admin page → **Run the test**: should say ✅ Ready.
- [ ] Admin page → **Open the sign** → print the QR poster and table cards.
- [ ] **After the wedding:** run the workflow again with **warm = 0**, so nothing runs (or costs) when unused. Set Render back to Free.

## Troubleshooting

| Problem | Fix |
|---|---|
| Health says `configured: false` | `FLUX_ENDPOINT_URL` or `FLUX_API_TOKEN` missing on Render |
| Guests see "Unable to reach the art studio" | Check Modal → Apps → keepsake-flux → Logs. A 401 means the two `FLUX_API_TOKEN` values don't match |
| Modal log: "gated repo" / 403 from Hugging Face | Accept the FLUX licence (step 1.2) with the same account as your token |
| Deploy action fails at "Deploy" | `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` wrong or missing |
| Out of GPU memory | In `flux_app.py` set `GPU = "A100-80GB"` (or `KEEPSAKE_GPU` env) |
| Guests got the "quick watercolour" note | All AI engines were busy or out of allowance. Check `/api/health` for which one is `usable: false` |
| Long waits when busy | Run the workflow with a higher `max_gpus` |
