#!/usr/bin/env bash
set -euo pipefail

# Upload only "tuymans" assets (SD checkpoints + LoRAs) to a single HF model repo.
#
# Usage:
#   HF_TOKEN=... bash scripts/hf_style_library_upload_tuymans.sh
#
# Optional env:
#   HF_OWNER=mulenmara
#   HF_REPO=style-library
#   SD_SRC="/Volumes/Bez názvu/modely/modely"
#   LORA_SRC="/Volumes/Bez názvu/modely/lora"

HF_OWNER="${HF_OWNER:-mulenmara}"
HF_REPO="${HF_REPO:-style-library}"
SD_SRC="${SD_SRC:-/Volumes/Bez názvu/modely/modely}"
LORA_SRC="${LORA_SRC:-/Volumes/Bez názvu/modely/lora}"

if [[ -z "${HF_TOKEN:-}" ]]; then
  echo "ERROR: HF_TOKEN is not set."
  exit 1
fi

if ! command -v hf >/dev/null 2>&1; then
  echo "ERROR: 'hf' CLI not found. Install with: brew install huggingface-cli"
  exit 1
fi

if [[ ! -d "$SD_SRC" ]]; then
  echo "ERROR: SD_SRC not found: $SD_SRC"
  exit 1
fi

if [[ ! -d "$LORA_SRC" ]]; then
  echo "ERROR: LORA_SRC not found: $LORA_SRC"
  exit 1
fi

TARGET_REPO_ID="${HF_OWNER}/${HF_REPO}"

echo "==> Authenticating to Hugging Face (token only, not saved to git credential)"
hf auth login --token "$HF_TOKEN" --no-add-to-git-credential >/dev/null

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "==> Building manifest.tuymans.json"
python3 - "$SD_SRC" "$LORA_SRC" >"$tmp/manifest.tuymans.json" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

sd_src = sys.argv[1]
lora_src = sys.argv[2]

def list_safetensors(d):
  out = []
  for name in sorted(os.listdir(d)):
    if name.startswith("._"):
      continue
    if "tuymans" not in name.lower():
      continue
    if not name.lower().endswith(".safetensors"):
      continue
    p = os.path.join(d, name)
    try:
      st = os.stat(p)
      out.append({"name": name, "bytes": int(st.st_size)})
    except FileNotFoundError:
      pass
  return out

manifest = {
  "generated_at": datetime.now(timezone.utc).isoformat(),
  "filter": "tuymans",
  "layout": {"checkpoints": "checkpoints/*.safetensors", "loras": "loras/*.safetensors"},
  "checkpoints": list_safetensors(sd_src),
  "loras": list_safetensors(lora_src),
}

json.dump(manifest, sys.stdout, indent=2)
PY

echo "==> Uploading manifest.tuymans.json"
hf upload "$TARGET_REPO_ID" "$tmp/manifest.tuymans.json" "manifest.tuymans.json" \
  --commit-message "Add tuymans manifest" >/dev/null

echo "==> Uploading tuymans SD checkpoints -> checkpoints/"
hf upload "$TARGET_REPO_ID" "$SD_SRC" "checkpoints" \
  --include "*tuymans*.safetensors" \
  --exclude "._*" \
  --commit-message "Upload tuymans checkpoints" \
  --commit-description "Upload tuymans SD checkpoints from local library." \
  --no-quiet

echo "==> Uploading tuymans LoRAs -> loras/"
hf upload "$TARGET_REPO_ID" "$LORA_SRC" "loras" \
  --include "*tuymans*.safetensors" \
  --exclude "._*" \
  --commit-message "Upload tuymans LoRAs" \
  --commit-description "Upload tuymans LoRA weights from local library." \
  --no-quiet

echo "==> Done: https://huggingface.co/${TARGET_REPO_ID}"

