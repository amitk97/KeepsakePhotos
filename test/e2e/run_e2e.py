"""End-to-end browser test with a fake Gemini server (no API key needed).

Run:  python3 test/e2e/run_e2e.py
Needs: Python Playwright, Pillow, Google Chrome (or `playwright install chromium`), Node 22+.
"""

import base64
import io
import json
import os
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def png_bytes(size, colour):
    img = Image.new("RGB", size, "#FAF6EE")
    d = ImageDraw.Draw(img)
    w, h = size
    d.ellipse([w * 0.35, h * 0.08, w * 0.65, h * 0.3], fill="#E0B58F", outline="#1D3B2D", width=6)
    d.polygon([(w * 0.3, h * 0.32), (w * 0.7, h * 0.32), (w * 0.8, h * 0.95), (w * 0.2, h * 0.95)], fill=colour)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


FAKE_ART = base64.b64encode(png_bytes((768, 1024), "#B3122E")).decode()


class FakeGemini(BaseHTTPRequestHandler):
    mode = "ok"
    requests = []

    def log_message(self, *a):
        pass

    def do_POST(self):
        if self.path.startswith("/cf/accounts/"):
            from email.parser import BytesParser
            from email.policy import default as email_default
            raw = self.rfile.read(int(self.headers["Content-Length"]))
            msg = BytesParser(policy=email_default).parsebytes(
                b"Content-Type: " + self.headers["Content-Type"].encode() + b"\r\n\r\n" + raw)
            fields = {p.get_param("name", header="content-disposition"): p.get_payload(decode=True) for p in msg.iter_parts()}
            small = Image.open(io.BytesIO(fields["input_image_0"]))
            FakeGemini.requests.append({"path": "/cf", "auth": self.headers.get("Authorization"),
                                        "prompt": fields["prompt"].decode(), "small": small.size})
            if FakeGemini.mode == "fail":
                self.send_response(500)
                self.end_headers()
                return
            payload = json.dumps({"success": True, "result": {"image": FAKE_ART}}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/flux":
            FakeGemini.requests.append({"path": "/flux", "auth": self.headers.get("Authorization"), "body": body})
            time.sleep(1)
            payload = json.dumps({"image": FAKE_ART, "mimeType": "image/png", "seconds": 1.0}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        FakeGemini.requests.append({"path": self.path, "key": self.headers.get("x-goog-api-key"), "body": body})
        if FakeGemini.mode == "fail":
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'{"error":"bad"}')
            return
        if body["generationConfig"]["responseModalities"] == ["TEXT"]:
            parts = [{"text": "Deep red silk lehenga with heavy gold zari embroidery border, sheer dupatta."}]
        else:
            time.sleep(1)
            parts = [{"inlineData": {"mimeType": "image/png", "data": FAKE_ART}}]
        payload = json.dumps({"candidates": [{"content": {"parts": parts}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    gemini_port, app_port = free_port(), free_port()
    mock = ThreadingHTTPServer(("127.0.0.1", gemini_port), FakeGemini)
    threading.Thread(target=mock.serve_forever, daemon=True).start()

    env = {
        **os.environ,
        "PORT": str(app_port),
        "HOST": "127.0.0.1",
        "GEMINI_API_KEY": "fake-key",
        "ENGINE_COOLDOWN_MS": "1",
        "GEMINI_API_BASE": f"http://127.0.0.1:{gemini_port}/v1beta/models",
    }
    server = subprocess.Popen(["node", "server/index.js"], cwd=ROOT, env=env)
    base = f"http://127.0.0.1:{app_port}"

    photo = OUT / "guest.jpg"
    Image.open(io.BytesIO(png_bytes((3000, 4000), "#2E4A8C"))).convert("RGB").save(photo, "JPEG")

    failures = []
    try:
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", app_port), 0.2).close()
                break
            except OSError:
                time.sleep(0.1)

        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(channel="chrome")
            except Exception:
                browser = p.chromium.launch()

            # ---- Phone: full guest journey ----
            phone = browser.new_context(
                viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
            )
            page = phone.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(base)
            page.screenshot(path=OUT / "1-welcome.png")

            page.click("[data-action=begin]")
            expect(page.locator("#step2")).to_be_visible()

            # "Take a Photo" on a phone must open the native camera input on the first tap.
            with page.expect_file_chooser(timeout=3000) as fc:
                page.click("#photoSelectionButtons [data-action=take-photo]")
            chooser = fc.value
            capture = chooser.element.get_attribute("capture")
            assert chooser.element.get_attribute("id") == "nativeCameraInput", "camera tap didn't open the camera input"
            assert capture == "environment", f"capture attribute was {capture}"
            chooser.set_files(str(photo))
            expect(page.locator("#photoPreviewContainer")).to_be_visible()
            expect(page.locator("#submitBtn")).to_be_enabled()

            page.fill("#guestName", "Maya & Arjun")
            page.click("#suggestionChips .chip >> nth=1")
            assert page.input_value("#guestMessage") == "Best night ever! ✨"
            assert page.inner_text("#charCounter").startswith("18")
            page.screenshot(path=OUT / "2-details.png", full_page=True)

            page.click("#submitBtn")
            expect(page.locator("#step3")).to_be_visible()
            expect(page.locator("#step4")).to_be_visible(timeout=20000)
            page.screenshot(path=OUT / "3-result.png", full_page=True)

            # Photo was resized before upload, and the outfit notes reached the painting prompt.
            paint = [r for r in FakeGemini.requests if r["body"]["generationConfig"]["responseModalities"] == ["IMAGE"]][-1]
            sent = Image.open(io.BytesIO(base64.b64decode(paint["body"]["contents"][0]["parts"][1]["inlineData"]["data"])))
            assert max(sent.size) == 1536, f"photo sent at {sent.size}"
            assert "gold zari embroidery" in paint["body"]["contents"][0]["parts"][0]["text"]
            assert paint["key"] == "fake-key"
            assert paint["body"]["generationConfig"]["imageConfig"]["aspectRatio"] == "3:4"

            # The canvas contains the painted art (red dress pixel inside the frame).
            pixel = page.evaluate(
                "() => Array.from(document.getElementById('portraitCanvas').getContext('2d').getImageData(600, 1300, 1, 1).data)"
            )
            assert pixel[0] > 150 and pixel[1] < 60, f"art not drawn, pixel={pixel}"

            # The key never reaches the browser.
            html = page.content() + page.evaluate("() => performance.getEntries().map(e => e.name).join(' ')")
            assert "fake-key" not in html

            with page.expect_download() as dl:
                page.click("[data-action=download]")
            assert dl.value.suggested_filename == "Pooja_Amit_Wedding_Keepsake_maya_arjun.png"

            # Paint it again reuses the same photo.
            before = len(FakeGemini.requests)
            page.click("[data-action=regenerate]")
            expect(page.locator("#step4")).to_be_visible(timeout=20000)
            assert len(FakeGemini.requests) == before + 2

            # ---- Every AI engine down: the phone paints a free watercolour itself (no stuck spinner) ----
            FakeGemini.mode = "fail"
            page.click("[data-action=regenerate]")
            expect(page.locator("#step4")).to_be_visible(timeout=30000)
            expect(page.locator("#quickNote")).to_be_visible()
            page.screenshot(path=OUT / "4-quick-watercolour.png", full_page=True)
            FakeGemini.mode = "ok"

            # ---- Reset ----
            FakeGemini.mode = "ok"
            page.click("[data-action=regenerate]")
            expect(page.locator("#step4")).to_be_visible(timeout=20000)
            expect(page.locator("#quickNote")).to_be_hidden()
            page.click("[data-action=reset]")
            expect(page.locator("#step1")).to_be_visible()
            page.click("[data-action=begin]")
            assert page.input_value("#guestName") == ""
            expect(page.locator("#submitBtn")).to_be_disabled()

            assert not errors, f"page errors: {errors}"
            phone.close()

            # ---- Laptop: live camera modal opens with a fake webcam ----
            laptop_browser = p.chromium.launch(
                args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
            )
            laptop = laptop_browser.new_context(viewport={"width": 1280, "height": 900}, permissions=["camera"])
            lp = laptop.new_page()
            lp.goto(base)
            lp.click("[data-action=begin]")
            lp.click("#photoSelectionButtons [data-action=take-photo]")
            expect(lp.locator("#cameraModal")).to_be_visible(timeout=5000)
            lp.wait_for_function("() => document.getElementById('cameraVideo').videoWidth > 0")
            lp.screenshot(path=OUT / "5-laptop-camera.png")
            lp.click("[data-action=capture]")
            expect(lp.locator("#cameraModal")).to_be_hidden()
            expect(lp.locator("#photoPreviewContainer")).to_be_visible()
            laptop_browser.close()

            # ---- FLUX mode: same guest journey, painted by the (fake) Modal service ----
            flux_port = free_port()
            flux_env = {**env, "PORT": str(flux_port), "GEMINI_API_KEY": "",
                        "FLUX_ENDPOINT_URL": f"http://127.0.0.1:{gemini_port}/flux", "FLUX_API_TOKEN": "flux-secret",
                        "CLOUDFLARE_ACCOUNT_ID": "acct", "CLOUDFLARE_API_TOKEN": "cf-secret",
                        "CLOUDFLARE_API_BASE": f"http://127.0.0.1:{gemini_port}/cf", "IMAGE_PROVIDERS": "cloudflare,flux"}
            flux_server = subprocess.Popen(["node", "server/index.js"], cwd=ROOT, env=flux_env)
            try:
                for _ in range(50):
                    try:
                        socket.create_connection(("127.0.0.1", flux_port), 0.2).close()
                        break
                    except OSError:
                        time.sleep(0.1)
                fctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
                fp = fctx.new_page()
                fp.goto(f"http://127.0.0.1:{flux_port}")
                health = fp.evaluate("() => fetch('/api/health').then(r => r.json())")
                assert [e["name"] for e in health["engines"]] == ["cloudflare", "flux"], health
                fp.click("[data-action=begin]")
                fp.set_input_files("#fileInput", str(photo))
                expect(fp.locator("#submitBtn")).to_be_enabled()
                fp.fill("#guestName", "Flux Guest")
                fp.click("#submitBtn")
                expect(fp.locator("#step4")).to_be_visible(timeout=20000)
                expect(fp.locator("#quickNote")).to_be_hidden()
                cf_req = [r for r in FakeGemini.requests if r["path"] == "/cf"][-1]
                assert cf_req["auth"] == "Bearer cf-secret"
                assert max(cf_req["small"]) < 512, cf_req["small"]
                assert "watercolour" in cf_req["prompt"].lower()
                assert not [r for r in FakeGemini.requests if r["path"] == "/flux"], "FLUX used while Cloudflare was free"
                fp.screenshot(path=OUT / "6-flux-result.png", full_page=True)
                fctx.close()
            finally:
                flux_server.terminate()
            browser.close()
    except AssertionError as e:
        failures.append(str(e))
    finally:
        server.terminate()
        mock.shutdown()

    if failures:
        print("E2E FAILED:", failures)
        sys.exit(1)
    print("E2E PASSED. Screenshots in test-results/")


if __name__ == "__main__":
    main()
