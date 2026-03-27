#!/usr/bin/env python3
"""Setup script for project-memory skill. Installs dependencies and downloads embedding model."""

import subprocess
import sys
from pathlib import Path


def main():
    script_dir = Path(__file__).parent
    requirements = script_dir / "requirements.txt"

    print("=== Project Memory Setup ===\n")

    # Install pip dependencies
    print("[1/2] Installing Python dependencies...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", str(requirements)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"ERROR installing dependencies:\n{result.stderr}")
        sys.exit(1)
    print("  Dependencies installed.\n")

    # Download and cache embedding model
    print("[2/2] Downloading embedding model (nomic-ai/nomic-embed-text-v1.5)...")
    print("  This may take a few minutes on first run...\n")
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5", trust_remote_code=True)
        # Quick test
        test = model.encode(["test"])
        dim = test.shape[1]
        print(f"  Model loaded. Embedding dimension: {dim}\n")
    except Exception as e:
        print(f"ERROR loading model: {e}")
        sys.exit(1)

    print("=== Setup complete! ===")
    print("You can now use project-memory to index your projects.")


if __name__ == "__main__":
    main()
