#!/usr/bin/env bash
set -euo pipefail

# Migrates local SD checkpoints + LoRA safetensors into a single Hugging Face model repo:
#   https://huggingface.co/<owner>/<repo>
# Layout in the target repo:
#   checkpoints/*.safetensors
#   loras/*.safetensors
#   manifest.json
#
# Usage:
#   HF_TOKEN=... bash scripts/hf_style_library_migrate.sh
#
# Optional env:
#   HF_OWNER=mulenmara
#   HF_REPO=style-library
#   SD_SRC="/Volumes/Bez názvu/modely/modely"
#   LORA_SRC="/Volumes/Bez názvu/modely/lora"
#   DELETE_OLD=1  # after upload, delete old repos listed in OLD_REPOS below

HF_OWNER="${HF_OWNER:-mulenmara}"
HF_REPO="${HF_REPO:-style-library}"
SD_SRC="${SD_SRC:-/Volumes/Bez názvu/modely/modely}"
LORA_SRC="${LORA_SRC:-/Volumes/Bez názvu/modely/lora}"
DELETE_OLD="${DELETE_OLD:-0}"

if [[ -z "${HF_TOKEN:-}" ]]; then
  echo "ERROR: HF_TOKEN is not set."
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
API_BASE="https://huggingface.co"

tmp="$(mktemp -d "/tmp/hf-style-library.XXXXXX")"
cleanup() {
  rm -rf "$tmp" || true
}
trap cleanup EXIT

askpass="$tmp/askpass.sh"
cat >"$askpass" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
prompt="${1:-}"
if [[ "$prompt" == *"Username"* ]]; then
  # Hugging Face supports using "__token__" as the username with access tokens.
  echo "__token__"
  exit 0
fi
echo "${HF_TOKEN:?missing}"
EOS
chmod 700 "$askpass"

echo "==> Ensuring target repo exists: $TARGET_REPO_ID"
repo_exists=0
if [[ "${HF_SKIP_CREATE:-0}" == "1" ]]; then
  repo_exists=1
fi
for attempt in 1 2 3 4 5; do
  [[ "$repo_exists" == "1" ]] && break
  if curl -sS -I "${API_BASE}/${TARGET_REPO_ID}" | head -n 1 | grep -q " 200 "; then
    repo_exists=1
    break
  fi
  sleep 1
done

if [[ "$repo_exists" == "1" ]]; then
  echo "==> Repo exists, skipping create."
else
  create_repo() {
    local payload="$1"
    # Print body to stdout and http status to stderr-friendly marker.
    curl -sS --retry 12 --retry-all-errors --retry-delay 1 \
      -X POST "${API_BASE}/api/repos/create" \
      -H "Authorization: Bearer ${HF_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$payload" \
      -w "\n__HTTP_STATUS__=%{http_code}\n"
  }

  create_payload_org="$(python3 - <<PY
import json
print(json.dumps({
  "type": "model",
  "name": "${HF_REPO}",
  "organization": "${HF_OWNER}",
  "private": False
}))
PY
  )"
  create_payload_user="$(python3 - <<PY
import json
print(json.dumps({
  "type": "model",
  "name": "${HF_REPO}",
  "private": False
}))
PY
  )"

  set +e
  create_out="$(create_repo "$create_payload_org" 2>&1)"
  create_ec=$?
  set -e
  if [[ $create_ec -ne 0 ]]; then
    echo "ERROR: Failed to call HF create repo endpoint."
    echo "$create_out" | sed -n '1,160p'
    exit 1
  fi

  status="$(echo "$create_out" | awk -F= '/__HTTP_STATUS__/ {print $2}' | tail -n 1)"
  body="$(echo "$create_out" | sed '/__HTTP_STATUS__/d')"
  if [[ "$status" == "200" || "$status" == "201" ]]; then
    : # created ok
  elif [[ "$status" == "409" || "$body" == *"already exists"* ]]; then
    : # exists ok
  else
    # Some accounts are not orgs; retry without "organization".
    set +e
    create_out2="$(create_repo "$create_payload_user" 2>&1)"
    create_ec2=$?
    set -e
    if [[ $create_ec2 -ne 0 ]]; then
      echo "ERROR: Failed to call HF create repo endpoint (user retry)."
      echo "$create_out2" | sed -n '1,160p'
      exit 1
    fi
    status2="$(echo "$create_out2" | awk -F= '/__HTTP_STATUS__/ {print $2}' | tail -n 1)"
    body2="$(echo "$create_out2" | sed '/__HTTP_STATUS__/d')"
    if [[ "$status2" == "200" || "$status2" == "201" ]]; then
      :
    elif [[ "$status2" == "409" || "$body2" == *"already exists"* ]]; then
      :
    else
      echo "ERROR: Unexpected HF response while creating repo."
      echo "$body2" | sed -n '1,160p'
      exit 1
    fi
  fi
fi

echo "==> Cloning: $TARGET_REPO_ID"
clone_ec=1
clone_out=""
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  set +e
  clone_out="$(GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="$askpass" git clone "https://huggingface.co/${TARGET_REPO_ID}" "$tmp/repo" 2>&1)"
  clone_ec=$?
  set -e
  if [[ $clone_ec -eq 0 ]]; then
    break
  fi
  echo "WARN: git clone attempt ${attempt}/10 failed; retrying in 2s..."
  echo "$clone_out" | sed -n '1,20p'
  sleep 2
done
if [[ $clone_ec -ne 0 ]]; then
  echo "ERROR: git clone failed."
  echo "$clone_out" | sed -n '1,120p'
  exit 1
fi

cd "$tmp/repo"
git lfs install >/dev/null
git lfs track "*.safetensors" >/dev/null

mkdir -p checkpoints loras

normalize_name() {
  local name="$1"
  name="${name#.\/}"
  # Drop AppleDouble files.
  if [[ "$name" == ._* ]]; then
    echo ""
    return
  fi
  # Normalize case + separators.
  name="$(echo "$name" | tr '[:upper:]' '[:lower:]')"
  name="${name//-/_}"
  name="${name//__/_}"
  # Known oddities:
  name="${name//tuymans_style_max/tuymans_style_max}"
  name="${name//tuymans_style_max/tuymans_style_max}"
  echo "$name"
}

echo "==> Copying SD checkpoints from: $SD_SRC"
while IFS= read -r src; do
  base="$(basename "$src")"
  [[ "$base" == ._* ]] && continue
  [[ "$base" != *.safetensors ]] && continue
  dst="$(normalize_name "$base")"
  [[ -z "$dst" ]] && continue
  # Keep SD filenames without "lora_" prefix.
  dst="${dst#lora_}"
  cp -p "$src" "checkpoints/$dst"
done < <(find "$SD_SRC" -maxdepth 1 -type f -name "*.safetensors" -print)

echo "==> Copying LoRA from: $LORA_SRC"
while IFS= read -r src; do
  base="$(basename "$src")"
  [[ "$base" == ._* ]] && continue
  [[ "$base" != *.safetensors ]] && continue
  dst="$(normalize_name "$base")"
  [[ -z "$dst" ]] && continue
  # Ensure LoRA are prefixed with lora_ in target.
  if [[ "$dst" != lora_* ]]; then
    dst="lora_${dst}"
  fi
  cp -p "$src" "loras/$dst"
done < <(find "$LORA_SRC" -maxdepth 1 -type f -name "*.safetensors" -print)

echo "==> Writing manifest.json"
python3 - <<'PY'
import json, os, hashlib
from pathlib import Path

def file_info(path: Path):
  st = path.stat()
  return {
    "path": str(path.as_posix()),
    "bytes": st.st_size,
  }

root = Path(".")
items = []
for sub in ("checkpoints", "loras"):
  p = root / sub
  if not p.exists():
    continue
  for f in sorted(p.glob("*.safetensors")):
    items.append(file_info(f))

manifest = {
  "version": 1,
  "repo": os.environ.get("TARGET_REPO_ID", ""),
  "items": items,
}

Path("manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
PY

echo "==> Writing README.md"
cat >README.md <<EOF
# Style Library

Unified storage for:
- SD checkpoints: \`checkpoints/\`
- LoRA: \`loras/\`

Generated catalog: \`manifest.json\`
EOF

git add .gitattributes checkpoints loras manifest.json README.md

if git diff --cached --quiet; then
  echo "No changes to commit (repo already up-to-date)."
else
  git commit -m "Add unified SD checkpoints + LoRA library" >/dev/null
fi

echo "==> Pushing to Hugging Face (this can take a while for large files)"
push_ec=1
push_out=""
for attempt in 1 2 3; do
  set +e
  push_out="$(GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="$askpass" git push 2>&1)"
  push_ec=$?
  set -e
  if [[ $push_ec -eq 0 ]]; then
    break
  fi
  echo "WARN: git push attempt ${attempt}/3 failed; retrying in 5s..."
  echo "$push_out" | sed -n '1,60p'
  sleep 5
done
if [[ $push_ec -ne 0 ]]; then
  echo "ERROR: git push failed."
  echo "$push_out" | sed -n '1,160p'
  exit 1
fi

echo "==> Upload done: https://huggingface.co/${TARGET_REPO_ID}"

OLD_MODEL_REPOS=(
  "tuymans_SD_model"
  "Adrian_Ghenie_style"
  "Julius_Hofmann_style"
  "peter_doig_style"
  "marlene_dumas_style"
  "tuymans_style_max"
  "tuymans_comfy"
)

OLD_DATASET_REPOS=(
  "loras"
)

if [[ "$DELETE_OLD" == "1" ]]; then
  echo "==> Deleting old repos (models + datasets)"
  # Use the Hub API. Best-effort with retries.
  for r in "${OLD_MODEL_REPOS[@]}"; do
    payload="$(python3 - <<PY
import json
print(json.dumps({"type":"model","name":"${HF_OWNER}/${r}"}))
PY
)"
    curl -sS --retry 12 --retry-all-errors --retry-delay 1 \
      -X DELETE "${API_BASE}/api/repos/delete" \
      -H "Authorization: Bearer ${HF_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$payload" >/dev/null || echo "WARN: failed to delete model ${HF_OWNER}/${r}"
  done

  for r in "${OLD_DATASET_REPOS[@]}"; do
    payload="$(python3 - <<PY
import json
print(json.dumps({"type":"dataset","name":"${HF_OWNER}/${r}"}))
PY
)"
    curl -sS --retry 12 --retry-all-errors --retry-delay 1 \
      -X DELETE "${API_BASE}/api/repos/delete" \
      -H "Authorization: Bearer ${HF_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$payload" >/dev/null || echo "WARN: failed to delete dataset ${HF_OWNER}/${r}"
  done
  echo "==> Delete requests sent."
else
  echo "==> Skipping deletion of old repos (set DELETE_OLD=1 to enable)."
fi
