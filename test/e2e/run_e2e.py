import re
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


A11Y_AUDIT = (Path(__file__).parent / "a11y_audit.js").read_text()


def audit(page, where):
    problems = page.evaluate(A11Y_AUDIT)
    assert not problems, f"Accessibility problems on {where}:\n  " + "\n  ".join(problems)


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

            # Fail on anything the Content-Security-Policy blocks, on every page.
            csp_blocks = []
            _new_context = browser.new_context

            # A fake free Hugging Face artist (the real ones are on the internet); the page is pointed at it.
            hf = {"mode": "ok", "calls": 0, "prompts": []}
            art = png_bytes((768, 1024), (210, 190, 220))
            cors = {"Access-Control-Allow-Origin": "*"}

            def fake_hf(route):
                req = route.request
                if hf["mode"] == "down":
                    return route.abort()
                if hf["mode"] == "quota":
                    return route.fulfill(status=200, headers=cors, content_type="text/event-stream",
                                         body='event: error\ndata: "You have exceeded your GPU quota"\n\n') \
                        if "/call/infer/" in req.url else route.fulfill(status=200, headers=cors, json={"event_id": "e1"} if "/call/" in req.url else ["/tmp/p.jpg"])
                if req.url.endswith("/gradio_api/upload"):
                    return route.fulfill(status=200, headers=cors, json=["/tmp/p.jpg"])
                if req.url.endswith("/gradio_api/call/infer"):
                    hf["calls"] += 1
                    hf["prompts"].append(json.loads(req.post_data)["data"][1])
                    return route.fulfill(status=200, headers=cors, json={"event_id": "e1"})
                if "/gradio_api/call/infer/" in req.url:
                    body = 'event: complete\ndata: [{"url": "https://fake-artist.hf.space/gradio_api/file=art.png"}, 1]\n\n'
                    return route.fulfill(status=200, headers=cors, content_type="text/event-stream", body=body)
                if "file=art.png" in req.url:
                    return route.fulfill(status=200, headers=cors, content_type="image/png", body=art)
                return route.fulfill(status=404, headers=cors, body="")

            def watched_context(**kw):
                ctx = _new_context(**kw)
                ctx.add_init_script("window.__KEEPSAKE_SPACES__ = [{ name: 'Fake artist', url: 'https://fake-artist.hf.space', fn: 'infer' }];")
                ctx.route("https://fake-artist.hf.space/**", fake_hf)
                ctx.on("console", lambda m: csp_blocks.append(m.text)
                       if ("Content Security Policy" in m.text or "Refused to" in m.text) else None)
                return ctx

            browser.new_context = watched_context

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
            audit(page, "welcome")

            # Language switch: Gujarati, remembered after reload, then back to English
            page.click("[data-lang=gu]")
            expect(page.locator("#step1 h2")).to_have_text("તમારું વોટરકલર લગ્ન પોટ્રેટ બનાવો")
            page.reload()
            expect(page.locator("#step1 h2")).to_have_text("તમારું વોટરકલર લગ્ન પોટ્રેટ બનાવો")
            assert page.get_attribute("html", "lang") == "gu"
            page.screenshot(path=OUT / "1b-gujarati.png")
            audit(page, "welcome (Gujarati)")
            # After choosing, the switcher shrinks to one globe button; tapping it shows all three again
            expect(page.locator("#langToggle")).to_be_visible()
            expect(page.locator("[data-lang=en]")).to_be_hidden()
            page.click("#langToggle")
            page.click("[data-lang=en]")
            expect(page.locator("#langToggle")).to_contain_text("English")
            expect(page.locator("#step1 h2")).to_have_text("Create Your Watercolour Wedding Portrait")
            page.click("[data-action=begin]")
            expect(page.locator("#step2")).to_be_visible()

            # "Take a Photo" on a phone must open the native camera input on the first tap.
            with page.expect_file_chooser(timeout=3000) as fc:
                page.click("#photoSelectionButtons [data-photo=camera]")
            chooser = fc.value
            capture = chooser.element.get_attribute("capture")
            assert chooser.element.get_attribute("id") == "nativeCameraInput", "camera tap didn't open the camera input"
            assert capture == "environment", f"capture attribute was {capture}"
            # "Choose Photo" opens the gallery picker (no camera capture) the same native way.
            with page.expect_file_chooser(timeout=3000) as fc2:
                page.click("#photoSelectionButtons [data-photo=library]")
            assert fc2.value.element.get_attribute("id") == "fileInput"
            assert fc2.value.element.get_attribute("capture") is None
            chooser.set_files(str(photo))
            expect(page.locator("#photoPreviewContainer")).to_be_visible()
            expect(page.locator("#submitBtn")).to_be_enabled()

            page.fill("#guestName", "Maya & Arjun")
            page.click("#suggestionChips .chip >> nth=1")
            assert page.input_value("#guestMessage") == "Best night ever! ✨"
            assert page.inner_text("#charCounter").startswith("18")
            page.screenshot(path=OUT / "2-details.png", full_page=True)
            audit(page, "details")
            # Empty name: error is announced, the field is flagged and focused
            page.fill("#guestName", "")
            page.click("#submitBtn")
            expect(page.locator("#uploadError")).to_be_visible()
            assert page.get_attribute("#guestName", "aria-invalid") == "true"
            assert page.evaluate("document.activeElement.id") == "guestName"
            audit(page, "details with error")
            page.fill("#guestName", "Maya & Arjun")

            page.click("#submitBtn")
            expect(page.locator("#step3")).to_be_visible()
            expect(page.locator("#step4")).to_be_visible(timeout=20000)
            page.screenshot(path=OUT / "3-result.png", full_page=True)
            audit(page, "result")
            assert page.evaluate("document.activeElement.textContent.trim()") == "Portrait Complete!", "focus should move to the result heading"
            assert "Maya & Arjun" in page.get_attribute("#portraitCanvas", "aria-label")

            # Before/after slider shows the photo and the painting, and moves
            expect(page.locator("#compareSection")).to_be_visible()
            assert page.get_attribute("#compareBefore", "src").startswith("data:image/jpeg")
            assert page.get_attribute("#compareAfter", "src").startswith("data:image/")
            page.locator("#compareRange").fill("20")
            assert page.evaluate("getComputedStyle(document.getElementById('compare')).getPropertyValue('--pos').trim()") == "20%"
            assert page.get_attribute("#compareRange", "aria-valuetext") == "Showing 80% painting"
            page.locator("#compareSection").screenshot(path=OUT / "3b-slider.png")

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
            assert dl.value.suggested_filename == "Maya_and_Arjun_keepsake_Pooja_and_Amit_wedding.png"

            # Paint it again reuses the same photo.
            before = len(FakeGemini.requests)
            page.click("[data-action=regenerate]")
            expect(page.locator("#step4")).to_be_visible(timeout=20000)
            assert len(FakeGemini.requests) == before + 2

            # Result step: try another background, and save the original photo.
            expect(page.locator(".again .swatch")).to_have_count(5)
            page.locator(".again .swatch[aria-label='Lilac']").click()
            expect(page.locator(".again .background-name")).to_have_text("Lilac")
            with page.expect_download() as dl:
                page.click("[data-action=saveOriginal]")
            assert "_original." in dl.value.suggested_filename, dl.value.suggested_filename

            # ---- Every server engine down: the phone asks the free artists (no stuck spinner) ----
            FakeGemini.mode = "fail"
            calls = hf["calls"]
            page.click("[data-action=regenerate]")
            expect(page.locator("#step4")).to_be_visible(timeout=30000)
            assert hf["calls"] == calls + 1
            assert "lilac" in hf["prompts"][-1].lower()
            page.screenshot(path=OUT / "4-free-artist.png", full_page=True)

            # Free artists out of allowance: a clear message, details kept.
            hf["mode"] = "quota"
            page.click("[data-action=regenerate]")
            expect(page.locator("#uploadErrorText")).to_contain_text("allowance", timeout=30000)
            assert page.input_value("#guestName") != ""
            hf["mode"] = "ok"
            FakeGemini.mode = "ok"

            # ---- Reset ----
            FakeGemini.mode = "ok"
            page.click("#submitBtn")
            expect(page.locator("#step4")).to_be_visible(timeout=20000)
            page.click("[data-action=reset]")
            expect(page.locator("#step1")).to_be_visible()
            page.click("[data-action=begin]")
            assert page.input_value("#guestName") == ""
            expect(page.locator("#submitBtn")).to_have_class(re.compile("not-ready"))

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
            lp.click("#photoSelectionButtons [data-photo=camera]")
            expect(lp.locator("#cameraModal")).to_be_visible(timeout=5000)
            lp.wait_for_function("() => document.getElementById('cameraVideo').videoWidth > 0")
            assert lp.evaluate("document.activeElement.classList.contains('shutter')"), "focus should move into the camera window"
            for _ in range(4):
                lp.keyboard.press("Tab")
            assert lp.evaluate("!!document.activeElement.closest('#cameraModal')"), "Tab should stay inside the camera window"
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
                        "CLOUDFLARE_API_BASE": f"http://127.0.0.1:{gemini_port}/cf", "IMAGE_PROVIDERS": "cloudflare,flux",
                        "ADMIN_PASSWORD": "e2e-pass", "SETTINGS_FILE": ""}
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
                fp.click("[data-lang=hi]")
                fp.click("[data-action=begin]")
                fp.set_input_files("#fileInput", str(photo))
                expect(fp.locator("#submitBtn")).to_be_enabled()
                fp.fill("#guestName", "Flux Guest")
                calls = hf["calls"]
                fp.click("#submitBtn")
                expect(fp.locator("#step4")).to_be_visible(timeout=20000)
                assert hf["calls"] == calls, "free artist used while the server had one"
                cf_req = [r for r in FakeGemini.requests if r["path"] == "/cf"][-1]
                assert cf_req["auth"] == "Bearer cf-secret"
                assert max(cf_req["small"]) < 512, cf_req["small"]
                assert "watercolour" in cf_req["prompt"].lower()
                assert not [r for r in FakeGemini.requests if r["path"] == "/flux"], "FLUX used while Cloudflare was free"
                fp.screenshot(path=OUT / "6-hindi-result.png", full_page=True)
                fctx.close()

                # Offline: page still opens from the saved copy; with no artist reachable the guest is asked to retry
                octx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
                op = octx.new_page()
                op.goto(f"http://127.0.0.1:{flux_port}")
                op.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true)")
                op.reload()
                op.wait_for_function("!!navigator.serviceWorker.controller")
                octx.set_offline(True)
                hf["mode"] = "down"
                op.reload()
                expect(op.locator("#step1 h2")).to_be_visible()
                op.click("[data-action=begin]")
                op.set_input_files("#fileInput", str(photo))
                expect(op.locator("#submitBtn")).to_be_enabled()
                op.fill("#guestName", "Offline Guest")
                op.click("#submitBtn")
                expect(op.locator("#uploadErrorText")).to_contain_text("busy", timeout=30000)
                hf["mode"] = "ok"
                op.screenshot(path=OUT / "7-offline.png", full_page=True)
                octx.close()

                # ---- Admin page ----
                site = f"http://127.0.0.1:{flux_port}"
                actx = browser.new_context(viewport={"width": 430, "height": 900})
                ap = actx.new_page()
                ap.goto(f"{site}/admin")
                expect(ap.locator("#loginCard")).to_be_visible()
                ap.fill("#password", "wrong")
                ap.click("#loginForm button")
                expect(ap.locator("#loginError")).to_have_text("Wrong password.")
                ap.fill("#password", "e2e-pass")
                ap.click("#loginForm button")
                expect(ap.locator("#dash")).to_be_visible()
                audit(ap, "admin")
                expect(ap.locator("#enginesBody tr")).to_have_count(2)
                expect(ap.locator("#driveStatus")).to_contain_text("Not connected yet")

                # Change wording: guests see it
                ap.fill("#venue-en", "Test Venue • May 2028")
                ap.fill("#presets-en", "Hello from admin\nSecond idea")
                ap.click("#settingsForm button[type=submit]")
                expect(ap.locator("#settingsMsg")).to_contain_text("Saved")
                gctx = browser.new_context(viewport={"width": 390, "height": 844})
                gp = gctx.new_page()
                gp.goto(site)
                expect(gp.locator("[data-i18n=venueLine]")).to_have_text("Test Venue • May 2028")
                gp.click("[data-action=begin]")
                expect(gp.locator("#suggestionChips .chip")).to_have_count(2)
                expect(gp.locator("#suggestionChips .chip").first).to_have_text("Hello from admin")

                # Close the studio: guests get the free artists
                ap.uncheck("#studioOpen")
                ap.wait_for_timeout(300)
                gp.set_input_files("#fileInput", str(photo))
                gp.fill("#guestName", "Closed Studio")
                gp.click("#submitBtn")
                expect(gp.locator("#step4")).to_be_visible(timeout=20000)
                ap.check("#studioOpen")
                gctx.close()

                # Wedding-day test
                ap.click("#testBtn")
                expect(ap.locator("#testResult .verdict")).to_contain_text("Ready", timeout=30000)
                expect(ap.locator("#testResult img")).to_have_count(2)
                # Style lab: one painting per style, choose one, guests then get it
                before = len([r for r in FakeGemini.requests if r["path"] == "/cf"])
                ap.set_input_files("#labPhoto", str(photo))
                expect(ap.locator("#labBtn")).to_be_enabled()
                ap.click("#labBtn")
                expect(ap.locator(".lab-card")).to_have_count(6, timeout=60000)
                lab_prompts = [r["prompt"] for r in FakeGemini.requests if r["path"] == "/cf"][before:]
                assert len(set(lab_prompts)) == 5, len(lab_prompts)
                ap.locator(".lab-card", has_text="Rich fabric detail").get_by_role("button", name="Use this style").click()
                expect(ap.locator("#currentStyle")).to_contain_text("Rich fabric detail")
                expect(ap.locator(".lab-card.chosen")).to_have_count(1)
                g2 = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
                g2.goto(site)
                g2.click("[data-action=begin]")
                g2.set_input_files("#fileInput", str(photo))
                g2.fill("#guestName", "Style Guest")
                g2.click("#submitBtn")
                expect(g2.locator("#step4")).to_be_visible(timeout=20000)
                assert "rich, detailed watercolour" in FakeGemini.requests[-1]["prompt"].lower()
                g2.context.close()
                ap.screenshot(path=OUT / "8-admin.png", full_page=True)
                actx.close()

                # ---- QR sign decodes to the site ----
                sctx = browser.new_context(viewport={"width": 900, "height": 1300})
                sp = sctx.new_page()
                sp.goto(f"{site}/sign/")
                expect(sp.locator(".qr svg")).to_have_count(1)
                audit(sp, "QR sign")
                sp.screenshot(path=OUT / "9-sign.png", full_page=True)
                sp.evaluate("document.fonts.ready")
                sp.wait_for_timeout(300)  # let the layout settle after fonts load
                import numpy as np, cv2
                gray = cv2.imdecode(np.frombuffer(sp.locator(".qr").first.screenshot(), np.uint8), cv2.IMREAD_GRAYSCALE)
                decoded = ""
                for det in (cv2.QRCodeDetector(), cv2.QRCodeDetectorAruco()):
                    for scale in (1, 2):
                        decoded = decoded or det.detectAndDecode(cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST))[0]
                assert decoded == f"{site}/", f"QR decoded to {decoded!r}"
                sp.select_option("#size", "card")
                expect(sp.locator(".qr svg")).to_have_count(4)
                sctx.close()
            finally:
                flux_server.terminate()
            assert not csp_blocks, "Content-Security-Policy blocked:\n  " + "\n  ".join(csp_blocks[:10])
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
