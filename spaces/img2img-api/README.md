---
title: mulennano img2img api
sdk: docker
app_port: 7860
---

# mulennano img2img API (HF Space)

FastAPI-only Space for SDXL img2img with optional LoRA.

## Endpoints

- `GET /health`
  - Returns `{ "ok": true }`

- `POST /api/img2img`
  - Request:
    - JSON body:
      - `{ "input": { ... } }`
  - Response:
    - `{ "images": [{ "url": "https://.../files/<id>.png" }], "seed": 123, "request_id": "..." }`

### Input schema (current)

```json
{
  "input": {
    "model_name": "stabilityai/stable-diffusion-xl-base-1.0",
    "image_url": "https://....jpg",
    "guidance_scale": 7,
    "noise_strength": 0.55,
    "num_inference_steps": 30,
    "num_images": 1,
    "seed": 123,
    "loras": [
      { "path": "https://huggingface.co/<repo>/resolve/main/<file>.safetensors", "scale": 0.85 }
    ]
  }
}
```

Notes:
- `model_name` may be a HF model ID or a direct URL supported by diffusers.
- `loras[].path` is expected to be a direct URL to a `.safetensors` LoRA file (HF `resolve/...` works).
