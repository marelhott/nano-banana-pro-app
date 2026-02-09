import hashlib
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import requests
import torch
from diffusers import StableDiffusionXLImg2ImgPipeline
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image


FILES_DIR = os.environ.get("FILES_DIR", "/tmp/files")
os.makedirs(FILES_DIR, exist_ok=True)

app = FastAPI(title="mulennano img2img API", version="0.1.0")
app.mount("/files", StaticFiles(directory=FILES_DIR), name="files")


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


def _download(url: str, out_path: str, timeout: int = 60) -> None:
    r = requests.get(url, stream=True, timeout=timeout)
    r.raise_for_status()
    with open(out_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)


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
    pipe: StableDiffusionXLImg2ImgPipeline


_loaded: Optional[LoadedPipe] = None


def _get_pipe(model_name: str) -> StableDiffusionXLImg2ImgPipeline:
    global _loaded
    model_name = model_name.strip()
    if not model_name:
        raise ValueError("model_name missing")

    if _loaded and _loaded.model_name == model_name:
        return _loaded.pipe

    # Free previous pipeline (VRAM).
    if _loaded:
        try:
            _loaded.pipe.to("cpu")
        except Exception:
            pass
        _loaded = None
        torch.cuda.empty_cache()

    torch_dtype = torch.float16
    pipe = StableDiffusionXLImg2ImgPipeline.from_pretrained(
        model_name,
        torch_dtype=torch_dtype,
        variant="fp16",
        use_safetensors=True,
    )

    pipe.to("cuda")
    pipe.set_progress_bar_config(disable=True)
    pipe.enable_vae_slicing()

    _loaded = LoadedPipe(model_name=model_name, pipe=pipe)
    return pipe


def _prepare_loras(pipe: StableDiffusionXLImg2ImgPipeline, loras: List[Dict[str, Any]]) -> None:
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
            _download(path, local_path, timeout=120)

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
    return {"ok": True}


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
        pipe = _get_pipe(model_name)
        _prepare_loras(pipe, loras)

        if seed_int is None:
            seed_int = int.from_bytes(os.urandom(2), "big")
        gen = torch.Generator(device="cuda").manual_seed(seed_int)

        # SDXL img2img expects init_image and strength.
        out = pipe(
            prompt="",
            image=img,
            strength=strength,
            guidance_scale=cfg,
            num_inference_steps=int(steps),
            num_images_per_prompt=int(num_images),
            generator=gen,
        )

        urls: List[Dict[str, Any]] = []
        for i, im in enumerate(out.images):
            fname = f"{request_id}-{i}.png"
            fpath = os.path.join(FILES_DIR, fname)
            im.save(fpath, format="PNG", optimize=False)
            # Build absolute URL to file.
            base = str(request.base_url).rstrip("/")
            urls.append({"url": f"{base}/files/{fname}", "content_type": "image/png"})

        elapsed_ms = int((time.time() - started) * 1000)
        return JSONResponse(
            {
                "images": urls,
                "seed": seed_int,
                "request_id": request_id,
                "elapsed_ms": elapsed_ms,
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})

