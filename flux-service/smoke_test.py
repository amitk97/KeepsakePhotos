"""Checks the deployed Modal services really work. Run after each deploy (the GitHub Action does this):
    FLUX_ENDPOINT_URL=… FLUX_API_TOKEN=… [UPSCALE_ENDPOINT_URL=…] python flux-service/smoke_test.py
Paints one test portrait, so it uses a few cents of the free Modal credit.
"""

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import png_size  # noqa: E402

PHOTO = Path(__file__).resolve().parent.parent / "server" / "assets" / "test-photo.jpg"


def post(url, body, token, timeout):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as err:
        return err.code, {}


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name} {detail}")
    return ok


def main():
    url, token = os.environ.get("FLUX_ENDPOINT_URL"), os.environ.get("FLUX_API_TOKEN")
    if not url or not token:
        print("FLUX_ENDPOINT_URL / FLUX_API_TOKEN not set: skipping smoke test.")
        return 0
    photo = base64.b64encode(PHOTO.read_bytes()).decode()
    results = []

    status, _ = post(url, {"image": photo}, "wrong-token", 120)
    results.append(check("rejects a wrong token", status == 401, f"(got {status})"))

    status, _ = post(url, {"image": "not-a-photo" * 20}, token, 600)
    results.append(check("rejects a bad photo", status == 400, f"(got {status})"))

    status, data = post(url, {"image": photo, "seed": 1}, token, 900)
    size = png_size(base64.b64decode(data.get("image", ""))) if status == 200 else None
    results.append(check("paints a portrait", status == 200 and size is not None and size[1] > size[0], f"(status {status}, size {size}, {data.get('seconds')}s)"))

    up_url = os.environ.get("UPSCALE_ENDPOINT_URL")
    if up_url and size:
        status, up = post(up_url, {"image": data["image"]}, token, 300)
        up_size = png_size(base64.b64decode(up.get("image", ""))) if status == 200 else None
        results.append(check("upscales 2x", up_size == (size[0] * 2, size[1] * 2), f"(status {status}, size {up_size})"))

    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
