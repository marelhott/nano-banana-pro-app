import base64
import io
import hashlib
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests
import torch
from diffusers import StableDiffusionImg2ImgPipeline, StableDiffusionXLImg2ImgPipeline
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image


FILES_DIR = os.environ.get("FILES_DIR", "/tmp/files")
os.makedirs(FILES_DIR, exist_ok=True)

HF_HUB_TOKEN = os.environ.get("HF_HUB_TOKEN", "").strip()  # optional: allow downloading private HF weights

app = FastAPI(title="mulennano img2img API", version="0.1.0")
app.mount("/files", StaticFiles(directory=FILES_DIR), name="files")

_STARTED_AT = time.time()

def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _as_int(v: Any, default: int) -> int:
    try:
        return int(v)
    except Exception:
        return default


def _as_float(v: Any, default: float) -> float:
    try:
        return float(v)
    except Exception:
        return default


def _download(url: str, out_path: str, timeout: int = 60, retries: int = 3) -> None:
    headers = {}
    if HF_HUB_TOKEN and ("huggingface.co" in url or "hf.co" in url):
        headers["Authorization"] = f"Bearer {HF_HUB_TOKEN}"
    last_err: Optional[Exception] = None
    for attempt in range(retries):
        try:
            # Use a tuple timeout so large downloads don't die on a single slow chunk.
            connect_timeout = 20
            read_timeout = max(60, int(timeout))
            r = requests.get(url, headers=headers, stream=True, timeout=(connect_timeout, read_timeout))
            r.raise_for_status()
            tmp_path = f"{out_path}.part"
            with open(tmp_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)
            os.replace(tmp_path, out_path)
            return
        except Exception as e:
            last_err = e
            try:
                if os.path.exists(f"{out_path}.part"):
                    os.remove(f"{out_path}.part")
            except Exception:
                pass
            # Exponential-ish backoff.
            time.sleep(min(12.0, 0.8 * (2**attempt)))
    if last_err is not None:
        raise last_err


def _sha256_of_str(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _load_image_from_url(url: str) -> Image.Image:
    r = requests.get(url, stream=True, timeout=60)
    r.raise_for_status()
    img = Image.open(r.raw).convert("RGB")
    return img


@dataclass
class LoadedPipe:
    model_name: str
    kind: str  # "sdxl" | "sd"
    pipe: Any


_loaded: Optional[LoadedPipe] = None


def _get_pipe(model_name: str) -> LoadedPipe:
    global _loaded
    model_name = model_name.strip()
    if not model_name:
        raise ValueError("model_name missing")

    if _loaded and _loaded.model_name == model_name:
        return _loaded

    # Free previous pipeline (VRAM).
    if _loaded:
        try:
            _loaded.pipe.to("cpu")
        except Exception:
            pass
        _loaded = None
        torch.cuda.empty_cache()

    torch_dtype = torch.float16
    # Support:
    # - HF repo id (Diffusers format) -> from_pretrained
    # - single-file checkpoints (.safetensors / .ckpt) -> from_single_file (download+cache)
    #
    # NOTE: For single-file checkpoints hosted on HF, use a direct URL (e.g. .../resolve/.../*.safetensors).
    is_url = model_name.startswith("http://") or model_name.startswith("https://")
    is_single_file = model_name.lower().endswith((".safetensors", ".ckpt"))

    def _load_sdxl_single(local_ckpt: str) -> Any:
        if hasattr(StableDiffusionXLImg2ImgPipeline, "from_single_file"):
            return StableDiffusionXLImg2ImgPipeline.from_single_file(local_ckpt, torch_dtype=torch_dtype)
        from diffusers import DiffusionPipeline  # type: ignore

        base = DiffusionPipeline.from_single_file(local_ckpt, torch_dtype=torch_dtype)
        return StableDiffusionXLImg2ImgPipeline(**base.components)  # type: ignore[arg-type]

    def _load_sd_single(local_ckpt: str) -> Any:
        if hasattr(StableDiffusionImg2ImgPipeline, "from_single_file"):
            return StableDiffusionImg2ImgPipeline.from_single_file(local_ckpt, torch_dtype=torch_dtype)
        from diffusers import DiffusionPipeline  # type: ignore

        base = DiffusionPipeline.from_single_file(local_ckpt, torch_dtype=torch_dtype)
        return StableDiffusionImg2ImgPipeline(**base.components)  # type: ignore[arg-type]

    if is_url or is_single_file:
        # If it's not a URL but looks like a file, assume user meant a URL and fail clearly.
        if not is_url:
            raise ValueError("Single-file checkpoint requires a direct URL (https://.../*.safetensors)")

        cache_key = _sha256_of_str(model_name)
        ext = ".safetensors" if model_name.lower().endswith(".safetensors") else ".ckpt"
        local_ckpt = os.path.join(FILES_DIR, f"ckpt-{cache_key}{ext}")
        if not os.path.exists(local_ckpt):
            _download(model_name, local_ckpt, timeout=900, retries=3)

        # Try SDXL first (primary), fall back to SD 1.x/2.x if the weights don't match.
        try:
            pipe = _load_sdxl_single(local_ckpt)
            kind = "sdxl"
        except Exception:
            pipe = _load_sd_single(local_ckpt)
            kind = "sd"
    else:
        # Prefer SDXL, but allow SD repo ids too.
        def _try_pretrained(cls: Any) -> Any:
            last_err: Optional[Exception] = None
            for variant, use_safetensors in (
                ("fp16", True),
                (None, True),
                ("fp16", False),
                (None, False),
            ):
                try:
                    kwargs: Dict[str, Any] = {"torch_dtype": torch_dtype, "use_safetensors": use_safetensors}
                    if variant:
                        kwargs["variant"] = variant
                    return cls.from_pretrained(model_name, **kwargs)
                except Exception as e:
                    last_err = e
            if last_err is not None:
                raise last_err
            raise RuntimeError("from_pretrained failed")

        try:
            pipe = _try_pretrained(StableDiffusionXLImg2ImgPipeline)
            kind = "sdxl"
        except Exception:
            pipe = _try_pretrained(StableDiffusionImg2ImgPipeline)
            kind = "sd"

    pipe.to("cuda")
    pipe.set_progress_bar_config(disable=True)
    pipe.enable_vae_slicing()

    _loaded = LoadedPipe(model_name=model_name, kind=kind, pipe=pipe)
    return _loaded


def _prepare_loras(pipe: Any, loras: List[Dict[str, Any]]) -> None:
    # Reset adapters to avoid leakage between requests.
    try:
        pipe.set_adapters([])
    except Exception:
        pass

    if not loras:
        return

    adapter_names: List[str] = []
    weights: List[float] = []

    for idx, item in enumerate(loras[:6]):
        path = str(item.get("path", "")).strip()
        if not path:
            continue
        w = _clamp(_as_float(item.get("scale", 1.0), 1.0), 0.0, 2.0)

        # Download URL to local file (cached by sha).
        cache_key = _sha256_of_str(path)
        local_path = os.path.join(FILES_DIR, f"lora-{cache_key}.safetensors")
        if not os.path.exists(local_path):
            _download(path, local_path, timeout=300, retries=3)

        adapter_name = f"lora_{idx}"
        pipe.load_lora_weights(local_path, adapter_name=adapter_name)
        adapter_names.append(adapter_name)
        weights.append(w)

    if not adapter_names:
        return

    # Multiple LoRA weights.
    try:
        pipe.set_adapters(adapter_names, adapter_weights=weights)
    except Exception:
        # Fall back: just use the first adapter.
        pipe.set_adapters([adapter_names[0]], adapter_weights=[weights[0]])


@app.get("/health")
def health() -> Dict[str, Any]:
    loaded = _loaded
    return {
        "ok": True,
        "uptime_s": int(time.time() - _STARTED_AT),
        "cuda": bool(torch.cuda.is_available()),
        "loaded_model": loaded.model_name if loaded else None,
        "loaded_pipeline": loaded.kind if loaded else None,
        "has_hf_hub_token": bool(HF_HUB_TOKEN),
    }


@app.post("/api/img2img")
async def img2img(request: Request) -> JSONResponse:
    started = time.time()
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    input_obj = body.get("input") if isinstance(body, dict) else None
    if not isinstance(input_obj, dict):
        raise HTTPException(status_code=400, detail="Missing input")

    model_name = str(input_obj.get("model_name", "")).strip()
    image_url = str(input_obj.get("image_url", "")).strip()
    if not model_name:
        raise HTTPException(status_code=400, detail="model_name missing")
    if not image_url:
        raise HTTPException(status_code=400, detail="image_url missing")

    cfg = _clamp(_as_float(input_obj.get("guidance_scale", 7), 7), 0.1, 30.0)
    strength = _clamp(_as_float(input_obj.get("noise_strength", 0.55), 0.55), 0.01, 1.0)
    steps = _clamp(_as_int(input_obj.get("num_inference_steps", 30), 30), 1, 80)
    num_images = _clamp(_as_int(input_obj.get("num_images", 1), 1), 1, 3)
    prompt = str(input_obj.get("prompt", "") or "").strip()
    negative_prompt = str(input_obj.get("negative_prompt", "") or "").strip()
    if not prompt:
        prompt = "high quality, fine art painting"
    if not negative_prompt:
        negative_prompt = "blurry, low quality, watermark, text, logo"
    seed = input_obj.get("seed", None)
    seed_int: Optional[int] = None
    if seed is not None:
        try:
            seed_int = int(seed)
        except Exception:
            seed_int = None

    loras = input_obj.get("loras", [])
    if not isinstance(loras, list):
        loras = []

    request_id = str(uuid.uuid4())

    try:
        img = _load_image_from_url(image_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load image_url: {e}")

    try:
        loaded = _get_pipe(model_name)
        pipe = loaded.pipe
        _prepare_loras(pipe, loras)

        if seed_int is None:
            seed_int = int.from_bytes(os.urandom(2), "big")
        gen = torch.Generator(device="cuda").manual_seed(seed_int)

        # SDXL img2img expects init_image and strength.
        out = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            image=img,
            strength=strength,
            guidance_scale=cfg,
            num_inference_steps=int(steps),
            num_images_per_prompt=int(num_images),
            generator=gen,
        )

        images_b64: List[str] = []
        # Return images inline as data URLs. This avoids:
        # - Netlify/browser mixed-content issues (http://.../files/...)
        # - CORS / private Space file fetches
        # - extra round-trips to download /files
        for im in out.images:
            buf = io.BytesIO()
            im.save(buf, format="PNG", optimize=False)
            b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            images_b64.append(f"data:image/png;base64,{b64}")

        elapsed_ms = int((time.time() - started) * 1000)
        return JSONResponse(
            {
                "images_b64": images_b64,
                "seed": seed_int,
                "request_id": request_id,
                "elapsed_ms": elapsed_ms,
                "pipeline": loaded.kind,
                "model_name": model_name,
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})
