# Go-live guide

About 40 minutes, all in a web browser. Nothing to install.

**How portraits get painted:** Cloudflare (free, ~80 a day) → Modal FLUX (free $30 credit a month) → if both are busy or not set up, the guest's phone asks free public artists on Hugging Face. Those share a small free allowance per internet connection, so on venue Wi-Fi they're only a backup: set up Cloudflare and Modal for the day.

**Just want to try it?** The test site needs no setup: <https://amitk97.github.io/KeepsakePhotos/>.

## Checklist

- [ ] 1. Hugging Face: accept the FLUX licence, make a token
- [ ] 2. Make a secret password
- [ ] 3. Modal: account, spending limit, two secrets, API token
- [ ] 4. GitHub: add the Modal token, press Deploy, copy the web addresses
- [ ] 5. Cloudflare: account, account ID, API token
- [ ] 6. Render: create the website, paste the values
- [ ] 7. Admin page: run the wedding-day test, try the style lab

## Values you'll copy

Keep these private: never post them in chats, email or GitHub issues.

| # | Value | Where it comes from | Where it goes |
|---|---|---|---|
| ① | Hugging Face token (`hf_…`) | Step 1 | Modal secret `huggingface-secret` |
| ② | Your secret password | Step 2 (you make it up) | Modal secret `keepsake-flux-auth` **and** Render `FLUX_API_TOKEN` |
| ③ | FLUX web address | Step 4 (Modal) | Render `FLUX_ENDPOINT_URL` |
| ④ | Upscaler web address (optional) | Step 4 (Modal) | Render `UPSCALE_ENDPOINT_URL` |
| ⑤ | Cloudflare account ID | Step 5 | Render `CLOUDFLARE_ACCOUNT_ID` |
| ⑥ | Cloudflare API token | Step 5 | Render `CLOUDFLARE_API_TOKEN` |
| ⑦ | Admin password | Step 6 (you make it up, different from ②) | Render `ADMIN_PASSWORD` |
| ⑧ | Settings store web address | Step 4 (Modal) | Render `SETTINGS_ENDPOINT_URL` |

---

## 1. Hugging Face

1. Sign up at <https://huggingface.co/join>.
2. Open <https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev> → **Agree and access repository** (free; non-commercial licence, fine for a private wedding).
3. **Settings → Access Tokens → Create new token**, type **Read**. Copy it: **value ①**.

## 2. Secret password

Make a long random string, 40+ characters (e.g. <https://www.random.org/strings/>). This is **value ②**. It stops strangers using your graphics card.

## 3. Modal

1. Sign up at <https://modal.com> with GitHub. Add a card under **Settings → Billing** (needed for the free $30 a month) and set a **spending limit of $30** so it can never charge you.
2. **Secrets → Create new secret:** name `huggingface-secret`, key `HF_TOKEN` = value ①.
3. **Secrets → Create new secret → Custom:** name `keepsake-flux-auth`, key `FLUX_API_TOKEN` = value ②.
4. **Settings → API Tokens → New token.** Keep the **Token ID** and **Token Secret** for step 4.

## 4. GitHub

1. In this repo: **Settings → Secrets and variables → Actions → New repository secret:** add `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` from step 3.4.
2. **Actions → Deploy FLUX to Modal → Run workflow** (warm = 0). Wait for the green tick (about 5 minutes the first time).
3. In Modal, open **Apps → keepsake-flux** and copy three web addresses:
   - `…-caricaturist-generate.modal.run`: **value ③**
   - `…-upscaler-upscale.modal.run`: **value ④** (optional)
   - `…-settings.modal.run`: **value ⑧** (keeps admin-page changes permanently)
4. Optional, so GitHub checks the live service after every deploy: add repository secrets `FLUX_ENDPOINT_URL` = ③, `FLUX_API_TOKEN` = ②, `UPSCALE_ENDPOINT_URL` = ④. Each check paints one test portrait (a few cents of free credit).

## 5. Cloudflare

1. Sign up at <https://dash.cloudflare.com/sign-up> (free, no card).
2. Copy your **Account ID** (dashboard home, right-hand side): **value ⑤**.
3. **My Profile → API Tokens → Create Token →** template **Workers AI** → Create. Copy it: **value ⑥**.

## 6. Render

1. Sign up at <https://render.com> with GitHub.
2. **New → Blueprint →** choose `KeepsakePhotos`.
3. Fill in `FLUX_ENDPOINT_URL` ③, `FLUX_API_TOKEN` ②, `UPSCALE_ENDPOINT_URL` ④, `CLOUDFLARE_ACCOUNT_ID` ⑤, `CLOUDFLARE_API_TOKEN` ⑥, `ADMIN_PASSWORD` ⑦ and `SETTINGS_ENDPOINT_URL` ⑧. Leave the four `GOOGLE_…` boxes empty.
4. Deploy. Your **guest link** is at the top, e.g. `https://keepsakephotos.onrender.com`.

## 7. First check

1. Open `https://…onrender.com/admin` and log in with ⑦.
2. **Run the test.** It should say ✅ Ready. (The very first FLUX portrait takes several minutes while Modal downloads the model once; later starts are much quicker.)
3. **Style lab:** upload a photo of someone in a real wedding outfit, compare the four watercolour styles, and pick one.
4. Open the guest link on your phone and make a portrait.

---

## The admin page

At `/admin` you can:
- see portraits made today, the queue, each AI engine's status and free allowance, and recent problems;
- switch the AI studio off (guests' phones then use the free Hugging Face artists);
- change the daily cap, the wording printed on keepsakes (an optional venue goes before the automatic date), the website venue line and the message suggestions (English, Gujarati, Hindi);
- see how many keepsakes were made today (guests see this count on the welcome page too; it resets each night);
- run the **wedding-day test** and the **style lab**;
- open the **printable QR sign** (A4 poster or 4 table cards).

Admin-page changes are kept permanently in your Modal account once `SETTINGS_ENDPOINT_URL` ⑧ is set (and in Google Drive too, if connected). Without either, Render's free plan forgets them when the server restarts. The admin page says which.

## Wedding day

- [ ] **About 1 hour before:** GitHub → Actions → Deploy FLUX to Modal → Run workflow with **warm = 1** (2 for a big crowd).
- [ ] Render: switch to the **Starter** plan for the day, so the site never sleeps.
- [ ] Admin page → **Run the test**: ✅ Ready.
- [ ] QR signs printed and out (admin page → Open the sign).
- [ ] **Afterwards:** run the workflow again with **warm = 0**; set Render back to Free.

## Later: connect Google Drive (optional)

Every finished keepsake is then uploaded to a shared folder. Until this is done, nothing is uploaded.

1. <https://console.cloud.google.com>: create a project, then **APIs & Services → Library →** enable **Google Drive API**.
2. **OAuth consent screen:** *External*; add your app name and email; add the scope `…/auth/drive.file`; set **Publishing status → In production**. (In "Testing" mode Google ends the connection after 7 days. `drive.file` is a non-sensitive scope, so no Google review is needed.)
3. **Credentials → Create credentials → OAuth client ID →** **Desktop app**. Copy the client ID and secret.
4. On a computer with Node 22 and this repo:
   ```bash
   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… node scripts/google-drive-auth.js
   ```
   Sign in with the account that should own the folder. It creates **"Pooja & Amit Wedding Keepsakes"** and prints `GOOGLE_REFRESH_TOKEN` and `GOOGLE_DRIVE_FOLDER_ID`.
5. Add all four `GOOGLE_…` values in Render. The admin page should say **Connected**.
6. Share the folder with your partner in Google Drive.

The app can only see files and the folder it created, nothing else in your Drive.

## Troubleshooting

| Problem | Fix |
|---|---|
| Admin test: an engine "Not set up" | Its values are missing on Render (see the table above) |
| Guests see "All our artists are busy" | Your engines were busy or not set up, and the free artists were too. Check the admin page's engine table |
| Guests see "free painting allowance … used up" | The free Hugging Face artists' allowance for that connection ran out. Set up Cloudflare/Modal, or wait |
| FLUX fails with 401 | The two copies of value ② (Modal secret and Render) don't match |
| Modal log: "gated repo" / 403 | Accept the FLUX licence (step 1.2) with the same account as your token |
| GitHub "Deploy" says Modal keys not added | Add `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` (step 4.1) |
| Out of GPU memory | Set `KEEPSAKE_GPU=A100-80GB` in the workflow, or edit `GPU` in `flux-service/flux_app.py` |
| Long waits when busy | Run the deploy workflow with a higher `max_gpus` |
| Admin page says "off" | Set `ADMIN_PASSWORD` on Render |
