"""FLUX.1 Kontext caricature service on Modal (serverless GPU).

Deploy:   modal deploy flux-service/flux_app.py
Warm for the wedding (no 1–2 min first-portrait wait):
          KEEPSAKE_WARM=1 modal deploy flux-service/flux_app.py
Back to pay-only-when-used afterwards:
          modal deploy flux-service/flux_app.py

Needs two Modal secrets (see SETUP.md):
  huggingface-secret   HF_TOKEN=<Hugging Face read token, with FLUX.1-Kontext-dev licence accepted>
  keepsake-flux-auth   FLUX_API_TOKEN=<long random string, also set on your website server>

API:  POST <endpoint URL>
      Authorization: Bearer <FLUX_API_TOKEN>
      {"image": "<base64 JPEG/PNG>", "seed": 123 (optional)}
  ->  {"image": "<base64 PNG>", "mimeType": "image/png", "seconds": 18.2}
"""

import os

import modal

MODEL_ID = "black-forest-labs/FLUX.1-Kontext-dev"
CACHE_DIR = "/cache"
MINUTES = 60

# Read on YOUR machine at deploy time.
WARM_CONTAINERS = int(os.environ.get("KEEPSAKE_WARM", "0"))
MAX_CONTAINERS = int(os.environ.get("KEEPSAKE_MAX_GPUS", "4"))  # caps cost and parallel guests
GPU = os.environ.get("KEEPSAKE_GPU", "L40S")  # 48 GB, keeps the whole model on the GPU

# Kontext works best at its trained sizes; 880×1184 is its closest 3:4 portrait size.
WIDTH, HEIGHT = 880, 1184

PROMPT = (
    "Transform this photo into a charming hand-drawn watercolour and ink wedding caricature. "
    "Keep every person recognisable with the same face, skin tone, hairstyle and expression, "
    "with a slightly enlarged head in a playful caricature style. "
    "Keep their outfits exactly the same: identical colours, fabrics, textures, sheen, patterns, "
    "embroidery, borders, drape, silhouette and jewellery, painted in visible watercolour detail. "
    "Do not change, simplify or restyle the clothing. "
    "Plain warm ivory paper background with a soft watercolour wash. No text, no borders, no signature."
)

image = (
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
)

app = modal.App("keepsake-flux")
model_cache = modal.Volume.from_name("keepsake-flux-cache", create_if_missing=True)

with image.imports():
    import base64
    import io
    import time

    import torch
    from diffusers import FluxKontextPipeline
    from fastapi import Header, HTTPException
    from PIL import Image, ImageOps


@app.cls(
    image=image,
    gpu=GPU,
    volumes={CACHE_DIR: model_cache},
    secrets=[
        modal.Secret.from_name("huggingface-secret"),
        modal.Secret.from_name("keepsake-flux-auth"),
    ],
    min_containers=WARM_CONTAINERS,
    max_containers=MAX_CONTAINERS,
    scaledown_window=5 * MINUTES,  # stays loaded 5 min after the last portrait
    timeout=10 * MINUTES,
)
class Caricaturist:
    @modal.enter()
    def load(self):
        start = time.time()
        self.pipe = FluxKontextPipeline.from_pretrained(
            MODEL_ID, torch_dtype=torch.bfloat16, token=os.environ.get("HF_TOKEN")
        ).to("cuda")
        model_cache.commit()  # keep downloaded weights for the next start
        print(f"Model ready in {time.time() - start:.0f}s")

    def paint(self, photo: "Image.Image", seed: int | None) -> "Image.Image":
        generator = torch.Generator("cuda").manual_seed(seed) if seed is not None else None
        return self.pipe(
            image=photo,
            prompt=PROMPT,
            width=WIDTH,
            height=HEIGHT,
            guidance_scale=2.5,
            num_inference_steps=28,
            generator=generator,
        ).images[0]

    @modal.method()
    def paint_file(self, photo_bytes: bytes) -> bytes:
        photo = ImageOps.exif_transpose(Image.open(io.BytesIO(photo_bytes))).convert("RGB")
        buf = io.BytesIO()
        self.paint(photo, seed=None).save(buf, format="PNG")
        return buf.getvalue()

    @modal.fastapi_endpoint(method="POST")
    def generate(self, item: dict, authorization: str | None = Header(default=None)):
        expected = os.environ.get("FLUX_API_TOKEN", "")
        if not expected or authorization != f"Bearer {expected}":
            raise HTTPException(status_code=401, detail="Unauthorised")

        data = item.get("image")
        if not isinstance(data, str) or len(data) < 100:
            raise HTTPException(status_code=400, detail="No photo received")
        try:
            photo = Image.open(io.BytesIO(base64.b64decode(data, validate=True)))
            photo = ImageOps.exif_transpose(photo).convert("RGB")
        except Exception:
            raise HTTPException(status_code=400, detail="Unreadable photo")

        seed = item.get("seed")
        start = time.time()
        result = self.paint(photo, int(seed) if isinstance(seed, (int, float)) else None)

        buf = io.BytesIO()
        result.save(buf, format="PNG")
        return {
            "image": base64.b64encode(buf.getvalue()).decode(),
            "mimeType": "image/png",
            "seconds": round(time.time() - start, 1),
        }


@app.local_entrypoint()
def main(photo: str, out: str = "caricature.png"):
    """Test from your computer: modal run flux-service/flux_app.py --photo me.jpg"""
    from pathlib import Path

    result = Caricaturist().paint_file.remote(Path(photo).read_bytes())
    Path(out).write_bytes(result)
    print(f"Saved {out}")
