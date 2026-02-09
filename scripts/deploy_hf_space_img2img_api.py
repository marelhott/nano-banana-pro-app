import argparse
import os
import sys
from pathlib import Path

from huggingface_hub import HfApi, upload_folder


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--token", default="", help="Hugging Face user access token")
    p.add_argument("--repo", default="", help="Space repo id (e.g. mulenmara/mulennano-img2img-api)")
    args = p.parse_args()

    token = (args.token or os.environ.get("HF_SPACE_TOKEN") or "").strip()
    if not token:
        print("Missing token. Provide --token or set HF_SPACE_TOKEN.", file=sys.stderr)
        return 2

    repo_id = (args.repo or os.environ.get("HF_SPACE_REPO") or "mulenmara/mulennano-img2img-api").strip()
    folder = Path(__file__).resolve().parent.parent / "spaces" / "img2img-api"
    if not folder.exists():
        print(f"Missing folder: {folder}", file=sys.stderr)
        return 2

    api = HfApi(token=token)

    # Create Space if it doesn't exist.
    try:
        api.create_repo(
            repo_id=repo_id,
            repo_type="space",
            exist_ok=True,
            space_sdk="docker",
            private=True,
        )
    except TypeError:
        # Older hub versions may not support 'private' kw in create_repo for spaces.
        api.create_repo(repo_id=repo_id, repo_type="space", exist_ok=True, space_sdk="docker")

    upload_folder(
        repo_id=repo_id,
        repo_type="space",
        folder_path=str(folder),
        token=token,
        commit_message="Deploy img2img FastAPI Space",
    )

    space_subdomain = repo_id.replace("/", "-")
    print(f"Deployed: https://huggingface.co/spaces/{repo_id}")
    print(f"API: https://{space_subdomain}.hf.space/api/img2img")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
