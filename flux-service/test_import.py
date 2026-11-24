"""Loads flux_app.py the way `modal deploy` does on GitHub: with Modal present but none of the AI
libraries (torch, diffusers, spandrel) and possibly no FastAPI. Catches import-time mistakes
before a deploy does. Uses a small stand-in for the `modal` package."""

import contextlib
import importlib
import sys
import types

import pytest


def fake_modal():
    m = types.ModuleType("modal")

    class Image:
        @staticmethod
        def debian_slim(**_):
            return Image()

        def __getattr__(self, _name):
            return lambda *a, **k: self  # pip_install, env, add_local_python_source…

        @contextlib.contextmanager
        def imports(self):
            try:
                yield
            except ImportError:
                pass  # same as Modal: missing libraries are fine outside the container

    class _Named:
        @classmethod
        def from_name(cls, *_a, **_k):
            return cls()

    class Dict(_Named, dict):
        pass

    class App:
        def __init__(self, *_a, **_k):
            self.registered = []

        def _register(self, *_a, **_k):
            def wrap(obj):
                self.registered.append(obj.__name__)
                return obj
            return wrap

        cls = function = _register

        def local_entrypoint(self, *_a, **_k):
            return lambda f: f

    def passthrough(*_a, **_k):
        return lambda f: f

    m.Image, m.App, m.Volume, m.Secret, m.Dict = Image, App, type("Volume", (_Named,), {}), type("Secret", (_Named,), {}), Dict
    m.enter = m.method = m.fastapi_endpoint = passthrough
    return m


@pytest.mark.parametrize("hide_fastapi", [False, True])
def test_flux_app_imports_on_a_deploy_machine(monkeypatch, hide_fastapi):
    monkeypatch.setitem(sys.modules, "modal", fake_modal())
    for lib in ["torch", "diffusers", "spandrel", "numpy"] + (["fastapi"] if hide_fastapi else []):
        monkeypatch.setitem(sys.modules, lib, None)  # import → ImportError
    sys.modules.pop("flux_app", None)
    app_module = importlib.import_module("flux_app")
    assert set(app_module.app.registered) >= {"Caricaturist", "Upscaler", "settings"}
    assert callable(app_module.Header)
