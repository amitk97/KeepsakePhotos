"""Request checks shared by the Modal services. No GPU or Modal imports, so it can be tested anywhere:
    python -m pytest flux-service
"""

import base64
import binascii
import hmac

DEFAULT_PROMPT = (
    "Repaint this photo as a soft, charming watercolour caricature painting for a wedding keepsake. "
    "Keep every person recognisable with the same face, skin tone, hairstyle and expression, "
    "with a slightly enlarged head. "
    "If there are several people, include every one of them, each equally recognisable, "
    "arranged naturally to fit a portrait-shaped painting. "
    "Keep their outfits exactly the same: identical colours, fabrics, textures, sheen, patterns, "
    "embroidery, borders, drape, silhouette and jewellery, painted in delicate watercolour washes. "
    "Do not change, simplify or restyle the clothing. "
    "Pure watercolour only: soft wet-on-wet blends, gentle colour bleeds, visible paper grain, "
    "no ink outlines, no pencil, no sketch lines. "
    "Plain warm ivory paper background with a light watercolour wash. No text, no borders, no signature."
)

MAX_PROMPT = 2000
MAX_IMAGE_B64 = 8_000_000
DEFAULT_GUIDANCE = 2.5


class BadRequest(ValueError):
    """The request can't be used; the message is safe to send back."""


def check_auth(header, expected):
    """True only for 'Bearer <expected>' with a non-empty expected token (constant-time compare)."""
    if not expected or not isinstance(header, str):
        return False
    return hmac.compare_digest(header.encode(), f"Bearer {expected}".encode())


def decode_image(data):
    if not isinstance(data, str) or len(data) < 100:
        raise BadRequest("No photo received")
    if len(data) > MAX_IMAGE_B64:
        raise BadRequest("Photo too large")
    try:
        return base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise BadRequest("Unreadable photo")


def parse_paint_request(item):
    """Returns (image_bytes, prompt, guidance, seed). Optional prompt/guidance let the admin
    page's style lab try variations; anything missing uses the defaults."""
    if not isinstance(item, dict):
        raise BadRequest("Send JSON")
    image = decode_image(item.get("image"))

    prompt = item.get("prompt")
    if prompt is None or (isinstance(prompt, str) and not prompt.strip()):
        prompt = DEFAULT_PROMPT
    elif not isinstance(prompt, str):
        raise BadRequest("Prompt must be text")
    prompt = prompt.strip()[:MAX_PROMPT]

    guidance = item.get("guidance", DEFAULT_GUIDANCE)
    if isinstance(guidance, bool) or not isinstance(guidance, (int, float)):
        guidance = DEFAULT_GUIDANCE
    guidance = min(5.0, max(1.0, float(guidance)))

    seed = item.get("seed")
    seed = int(seed) if isinstance(seed, (int, float)) and not isinstance(seed, bool) else None
    return image, prompt, guidance, seed


def png_size(data):
    """(width, height) of PNG bytes, or None."""
    if len(data) >= 24 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    return None
