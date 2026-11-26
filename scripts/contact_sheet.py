"""Makes yesterday's contact sheet: every keepsake from that day in a grid, saved to that day's
Keepsakes folder in Google Drive. Run each morning by .github/workflows/contact-sheet.yml.

Talks to your live site's admin page, so it needs SITE_URL and ADMIN_PASSWORD (a GitHub secret).
Does nothing if no keepsakes were made that day, or if the day already has a contact sheet.
Usage: python scripts/contact_sheet.py [YYYY-MM-DD]   (default: yesterday, UK date)
"""

import base64
import io
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

SITE = os.environ.get("SITE_URL", "https://keepsakephotos.onrender.com").rstrip("/")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
COLS, CELL_W, CELL_H, GAP, HEADER = 4, 400, 600, 24, 140
PAPER, GREEN, GOLD = (247, 241, 230), (30, 58, 44), (138, 106, 43)

cookie = ""


def request(path, body=None, timeout=90):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(SITE + path, data=data, method="POST" if data else "GET")
    if data:
        req.add_header("Content-Type", "application/json")
    if cookie:
        req.add_header("Cookie", cookie)
    return urllib.request.urlopen(req, timeout=timeout)


def wake_up():
    """The free Render plan sleeps; the first visit can take a minute."""
    for attempt in range(6):
        try:
            request("/api/health", timeout=90).read()
            return
        except Exception as err:  # noqa: BLE001
            print(f"Waiting for the site to wake up ({err})…")
            time.sleep(15)
    sys.exit("The site didn't wake up.")


def font(size, bold=False):
    for path in ["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def main():
    global cookie
    if not PASSWORD:
        print("ADMIN_PASSWORD isn't set, so there's nothing to do.")
        return
    day = sys.argv[1] if len(sys.argv) > 1 else (datetime.now(ZoneInfo("Europe/London")) - timedelta(days=1)).strftime("%Y-%m-%d")

    wake_up()
    res = request("/api/admin/login", {"password": PASSWORD})
    cookie = res.headers.get("Set-Cookie", "").split(";")[0]

    info = json.load(request(f"/api/admin/day?day={day}"))
    files = info.get("files", [])
    if not files:
        print(f"No keepsakes on {day}.")
        return
    if info.get("hasSheet"):
        print(f"{day} already has a contact sheet.")
        return

    rows = (len(files) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * CELL_W + (COLS + 1) * GAP, HEADER + rows * (CELL_H + GAP) + GAP), PAPER)
    draw = ImageDraw.Draw(sheet)
    nice = datetime.strptime(day, "%Y-%m-%d").strftime("%-d %B %Y")
    draw.text((sheet.width / 2, 70), "Pooja & Amit", font=font(56, True), fill=GREEN, anchor="mm")
    draw.text((sheet.width / 2, 115), f"{nice} · {len(files)} keepsake{'s' if len(files) != 1 else ''}", font=font(26), fill=GOLD, anchor="mm")

    for i, f in enumerate(files):
        x = GAP + (i % COLS) * (CELL_W + GAP)
        y = HEADER + (i // COLS) * (CELL_H + GAP)
        try:
            img = Image.open(io.BytesIO(request(f"/api/admin/thumb?id={f['id']}").read())).convert("RGB")
            img.thumbnail((CELL_W, CELL_H))
            sheet.paste(img, (x + (CELL_W - img.width) // 2, y + (CELL_H - img.height) // 2))
        except Exception as err:  # noqa: BLE001
            print(f"Couldn't add {f['name']}: {err}")
            draw.rectangle([x, y, x + CELL_W, y + CELL_H], fill=(233, 225, 208))

    out = io.BytesIO()
    sheet.save(out, "JPEG", quality=85)
    image = "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()
    request("/api/admin/contact-sheet", {"day": day, "image": image}, timeout=180).read()
    print(f"Saved 'Contact sheet {day}.jpg' with {len(files)} keepsakes.")


if __name__ == "__main__":
    main()
