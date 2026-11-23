# Setup guide (all in the cloud, about 30 minutes)

You'll create 3 accounts and copy 4 values between them. Nothing to install on your computer.

| Service | What it does | Cost |
|---|---|---|
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

## 5. Render: the website

1. Sign up at <https://render.com> with GitHub.
2. **New → Blueprint** → choose `KeepsakePhotos`. Render reads `render.yaml`.
3. When asked, fill in:
   - `FLUX_ENDPOINT_URL` = value ③
   - `FLUX_API_TOKEN` = value ②
   - `GEMINI_API_KEY`: optional backup (leave blank to skip)
4. Deploy. Your guest link is at the top, e.g. `https://keepsakephotos.onrender.com`.
5. Check it: open `https://…onrender.com/api/health`. It should say `"provider":"flux","configured":true`.

## 6. First test

Open the link on your phone and make a portrait. **The very first one takes several minutes** (Modal downloads the ~30 GB model once and saves it). After that, a cold start is about 1–2 minutes and a warm portrait about 15–30 seconds.

Try 10–20 photos with real outfits. To tweak the style or outfit faithfulness, edit `PROMPT` in `flux-service/flux_app.py` and commit. GitHub redeploys it automatically.

---

## Wedding day checklist

- [ ] **~1 hour before:** Actions → Deploy FLUX to Modal → Run workflow with **warm = 1** (or 2 for a big crowd). Portraits are now instant-start; you pay for that GPU by the hour.
- [ ] Render: switch the service to the **Starter** plan so the site never sleeps.
- [ ] Make one test portrait.
- [ ] Put the link on a QR code.
- [ ] **After the wedding:** run the workflow again with **warm = 0**, so nothing runs (or costs) when unused. Set Render back to Free.

## Troubleshooting

| Problem | Fix |
|---|---|
| Health says `configured: false` | `FLUX_ENDPOINT_URL` or `FLUX_API_TOKEN` missing on Render |
| Guests see "Unable to reach the art studio" | Check Modal → Apps → keepsake-flux → Logs. A 401 means the two `FLUX_API_TOKEN` values don't match |
| Modal log: "gated repo" / 403 from Hugging Face | Accept the FLUX licence (step 1.2) with the same account as your token |
| Deploy action fails at "Deploy" | `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` wrong or missing |
| Out of GPU memory | In `flux_app.py` set `GPU = "A100-80GB"` (or `KEEPSAKE_GPU` env) |
| Long waits when busy | Run the workflow with a higher `max_gpus` |
