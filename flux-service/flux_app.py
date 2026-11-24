"""FLUX.1 Kontext caricature service + Real-ESRGAN upscaler, on Modal (serverless GPU).

Deploy:   modal deploy flux-service/flux_app.py         (or the GitHub Action "Deploy FLUX to Modal")
Warm for the wedding (no first-portrait wait):
          KEEPSAKE_WARM=1 modal deploy flux-service/flux_app.py
Back to pay-only-when-used afterwards:
          modal deploy flux-service/flux_app.py

Needs two Modal secrets (see SETUP.md):
  huggingface-secret   HF_TOKEN=<Hugging Face read token, with FLUX.1-Kontext-dev licence accepted>
  keepsake-flux-auth   FLUX_API_TOKEN=<long random string, also set on your website server>

Endpoints (both: header  Authorization: Bearer <FLUX_API_TOKEN>):
  Caricaturist.generate  {"image": b64, "prompt"?: str, "guidance"?: 1-5, "seed"?: int}
                      -> {"image": b64 PNG, "mimeType": "image/png", "seconds": 18.2}
  Upscaler.upscale       {"image": b64}  -> {"image": b64 PNG (2x), "mimeType": "image/png", "seconds": 1.1}
"""

import os
import sys

import modal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import BadRequest, check_auth, decode_image, parse_paint_request  # noqa: E402

MODEL_ID = "black-forest-labs/FLUX.1-Kontext-dev"
CACHE_DIR = "/cache"
MINUTES = 60

# Read on YOUR machine at deploy time.
WARM_CONTAINERS = int(os.environ.get("KEEPSAKE_WARM", "0"))
MAX_CONTAINERS = int(os.environ.get("KEEPSAKE_MAX_GPUS", "4"))  # caps cost and parallel guests
GPU = os.environ.get("KEEPSAKE_GPU", "L40S")  # 48 GB, keeps the whole model on the GPU

# Kontext works best at its trained sizes; 880×1184 is its closest 3:4 portrait size.
WIDTH, HEIGHT = 880, 1184

# Real-ESRGAN x2plus (BSD-3-Clause), loaded with spandrel.
ESRGAN_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth"
ESRGAN_PATH = f"{CACHE_DIR}/realesrgan/RealESRGAN_x2plus.pth"
MAX_UPSCALE_EDGE = 1600  # bigger inputs don't need it

flux_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch==2.7.1",
        "diffusers>=0.34.0",
        "transformers>=4.51,<5",
        "accelerate>=1.6",
        "sentencepiece",
        "protobuf",
        "safetensors",
        "huggingface_hub[hf_xet]>=0.34",
        "pillow",
        "fastapi[standard]",
    )
    .env({"HF_HUB_CACHE": CACHE_DIR, "HF_XET_HIGH_PERFORMANCE": "1"})
    .add_local_python_source("core")
)

upscale_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch==2.7.1", "spandrel>=0.4", "numpy", "pillow", "fastapi[standard]")
    .add_local_python_source("core")
)

app = modal.App("keepsake-flux")
model_cache = modal.Volume.from_name("keepsake-flux-cache", create_if_missing=True)
auth_secret = modal.Secret.from_name("keepsake-flux-auth")

with flux_image.imports():
    import base64
    import io
    import time

    import torch
    from diffusers import FluxKontextPipeline
    from fastapi import Header, HTTPException
    from PIL import Image, ImageOps


def _png_b64(img):
    import base64
    import io

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


@app.cls(
    image=flux_image,
    gpu=GPU,
    volumes={CACHE_DIR: model_cache},
    secrets=[modal.Secret.from_name("huggingface-secret"), auth_secret],
    min_containers=WARM_CONTAINERS,
    max_containers=MAX_CONTAINERS,
    scaledown_window=5 * MINUTES,  # stays loaded 5 min after the last portrait
    timeout=10 * MINUTES,
    # Faster cold starts: Modal saves the container's memory after the model is loaded on the CPU,
    # so later starts restore it instead of reading ~30 GB of weights again.
    enable_memory_snapshot=True,
)
class Caricaturist:
    @modal.enter(snap=True)
    def load_to_cpu(self):
        start = time.time()
        self.pipe = FluxKontextPipeline.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16, token=os.environ.get("HF_TOKEN"))
        model_cache.commit()  # keep downloaded weights for the next start
        print(f"Model loaded on CPU in {time.time() - start:.0f}s (saved in snapshot)")

    @modal.enter(snap=False)
    def move_to_gpu(self):
        start = time.time()
        self.pipe.to("cuda")
        print(f"Model on GPU in {time.time() - start:.0f}s")

    def paint(self, photo, prompt, guidance, seed):
        generator = torch.Generator("cuda").manual_seed(seed) if seed is not None else None
        return self.pipe(
            image=photo,
            prompt=prompt,
            width=WIDTH,
            height=HEIGHT,
            guidance_scale=guidance,
            num_inference_steps=28,
            generator=generator,
        ).images[0]

    @modal.method()
    def paint_file(self, photo_bytes: bytes, prompt: str = "") -> bytes:
        from core import DEFAULT_PROMPT

        photo = ImageOps.exif_transpose(Image.open(io.BytesIO(photo_bytes))).convert("RGB")
        buf = io.BytesIO()
        self.paint(photo, prompt or DEFAULT_PROMPT, 2.5, None).save(buf, format="PNG")
        return buf.getvalue()

    @modal.fastapi_endpoint(method="POST")
    def generate(self, item: dict, authorization: str | None = Header(default=None)):
        if not check_auth(authorization, os.environ.get("FLUX_API_TOKEN", "")):
            raise HTTPException(status_code=401, detail="Unauthorised")
        try:
            image_bytes, prompt, guidance, seed = parse_paint_request(item)
            photo = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")
        except BadRequest as err:
            raise HTTPException(status_code=400, detail=str(err))
        except Exception:
            raise HTTPException(status_code=400, detail="Unreadable photo")

        start = time.time()
        result = self.paint(photo, prompt, guidance, seed)
        return {"image": _png_b64(result), "mimeType": "image/png", "seconds": round(time.time() - start, 1)}


with upscale_image.imports():
    import base64
    import io
    import time
    import urllib.request

    import numpy as np
    import torch
    from fastapi import Header, HTTPException
    from PIL import Image
    from spandrel import ModelLoader


@app.cls(
    image=upscale_image,
    gpu="L4",  # small, cheap GPU is plenty
    volumes={CACHE_DIR: model_cache},
    secrets=[auth_secret],
    max_containers=2,
    scaledown_window=2 * MINUTES,
    timeout=3 * MINUTES,
)
class Upscaler:
    @modal.enter()
    def load(self):
        if not os.path.exists(ESRGAN_PATH):
            os.makedirs(os.path.dirname(ESRGAN_PATH), exist_ok=True)
            urllib.request.urlretrieve(ESRGAN_URL, ESRGAN_PATH)
            model_cache.commit()
        self.model = ModelLoader().load_from_file(ESRGAN_PATH).cuda().eval()

    @modal.fastapi_endpoint(method="POST")
    def upscale(self, item: dict, authorization: str | None = Header(default=None)):
        if not check_auth(authorization, os.environ.get("FLUX_API_TOKEN", "")):
            raise HTTPException(status_code=401, detail="Unauthorised")
        try:
            img = Image.open(io.BytesIO(decode_image((item or {}).get("image")))).convert("RGB")
        except BadRequest as err:
            raise HTTPException(status_code=400, detail=str(err))
        except Exception:
            raise HTTPException(status_code=400, detail="Unreadable image")
        if max(img.size) > MAX_UPSCALE_EDGE:
            raise HTTPException(status_code=400, detail="Image already large")

        start = time.time()
        tensor = torch.from_numpy(np.asarray(img)).permute(2, 0, 1).float().div(255).unsqueeze(0).cuda()
        with torch.inference_mode():
            out = self.model(tensor).clamp(0, 1)
        arr = (out.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255).round().astype("uint8")
        return {"image": _png_b64(Image.fromarray(arr)), "mimeType": "image/png", "seconds": round(time.time() - start, 1)}


@app.local_entrypoint()
def main(photo: str, out: str = "caricature.png"):
    """Test from your computer: modal run flux-service/flux_app.py --photo me.jpg"""
    from pathlib import Path

    result = Caricaturist().paint_file.remote(Path(photo).read_bytes())
    Path(out).write_bytes(result)
    print(f"Saved {out}")
