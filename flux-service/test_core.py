import base64

import pytest

from core import DEFAULT_PROMPT, BadRequest, check_auth, decode_image, parse_paint_request, parse_settings_request, png_size

PNG_1x1 = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
PHOTO = base64.b64encode(PNG_1x1 * 10).decode()


def test_auth_needs_exact_bearer_token():
    assert check_auth("Bearer s3cret", "s3cret")
    assert not check_auth("Bearer wrong", "s3cret")
    assert not check_auth("s3cret", "s3cret")
    assert not check_auth(None, "s3cret")
    assert not check_auth("Bearer ", "")  # no token configured = locked


def test_defaults_when_only_a_photo_is_sent():
    image, prompt, guidance, seed = parse_paint_request({"image": PHOTO})
    assert image.startswith(b"\x89PNG")
    assert prompt == DEFAULT_PROMPT
    assert guidance == 2.5
    assert seed is None


def test_style_lab_options_are_cleaned():
    _, prompt, guidance, seed = parse_paint_request({"image": PHOTO, "prompt": "  soft  " + "x" * 3000, "guidance": 99, "seed": 7.0})
    assert prompt.startswith("soft") and len(prompt) == 2000
    assert guidance == 5.0
    assert seed == 7
    _, prompt, guidance, seed = parse_paint_request({"image": PHOTO, "prompt": "   ", "guidance": True, "seed": "x"})
    assert prompt == DEFAULT_PROMPT and guidance == 2.5 and seed is None


@pytest.mark.parametrize("item", [None, {}, {"image": "short"}, {"image": "!" * 200}, {"image": PHOTO, "prompt": 5}])
def test_bad_requests(item):
    with pytest.raises(BadRequest):
        parse_paint_request(item)


def test_rejects_huge_images():
    with pytest.raises(BadRequest):
        decode_image("A" * 8_000_004)


def test_default_prompt_is_watercolour_only():
    p = DEFAULT_PROMPT.lower()
    assert "watercolour" in p and "no ink outlines" in p and "several people" in p


def test_png_size():
    assert png_size(PNG_1x1) == (1, 1)
    assert png_size(b"not a png") is None


def test_settings_requests():
    assert parse_settings_request({"action": "get"}) == ("get", None)
    assert parse_settings_request({"action": "put", "settings": {"a": 1}}) == ("put", {"a": 1})
    for bad in [None, {}, {"action": "delete"}, {"action": "put", "settings": []}, {"action": "put", "settings": {"x": "y" * 200_000}}]:
        with pytest.raises(BadRequest):
            parse_settings_request(bad)
