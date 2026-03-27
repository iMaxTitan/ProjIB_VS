"""Shared utilities for project-memory scripts."""

import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Optional

# File extensions to index by default
CODE_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java",
    ".c", ".h", ".cpp", ".hpp", ".rb", ".php", ".cs", ".swift", ".kt",
}

TEXT_EXTENSIONS = {
    ".md", ".txt", ".rst", ".yaml", ".yml", ".toml", ".json", ".xml",
    ".html", ".css", ".scss", ".sql", ".sh", ".bash", ".dockerfile",
    ".env.example", ".gitignore", ".editorconfig",
}

ALL_EXTENSIONS = CODE_EXTENSIONS | TEXT_EXTENSIONS

# Directories to always skip
SKIP_DIRS = {
    ".git", ".project-memory", "node_modules", "__pycache__", ".venv",
    "venv", "env", ".env", "dist", "build", ".next", ".nuxt",
    "target", "vendor", ".idea", ".vscode", ".cache", "coverage",
    ".tox", ".mypy_cache", ".pytest_cache", "egg-info",
}

# Tree-sitter language mapping
TREE_SITTER_LANGS = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "c_sharp",
}


def get_memory_dir(project_dir: str) -> Path:
    """Get or create .project-memory directory."""
    mem_dir = Path(project_dir) / ".project-memory"
    mem_dir.mkdir(parents=True, exist_ok=True)
    (mem_dir / "vectors").mkdir(exist_ok=True)
    return mem_dir


def get_insights_db(project_dir: str) -> sqlite3.Connection:
    """Get or create SQLite connection for insights."""
    mem_dir = get_memory_dir(project_dir)
    db_path = mem_dir / "insights.db"
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS insights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    return conn


def file_hash(filepath: Path) -> str:
    """SHA256 hash of file contents."""
    return hashlib.sha256(filepath.read_bytes()).hexdigest()


def load_index(project_dir: str) -> dict:
    """Load file hash index for incremental updates."""
    index_path = get_memory_dir(project_dir) / "index.json"
    if index_path.exists():
        return json.loads(index_path.read_text(encoding="utf-8"))
    return {}


def save_index(project_dir: str, index: dict):
    """Save file hash index."""
    index_path = get_memory_dir(project_dir) / "index.json"
    index_path.write_text(json.dumps(index, indent=2), encoding="utf-8")


def collect_files(
    project_dir: str,
    extensions: Optional[set] = None,
    force: bool = False,
) -> list[Path]:
    """Collect project files, respecting .gitignore patterns and skip dirs."""
    root = Path(project_dir)
    exts = extensions or ALL_EXTENSIONS
    index = {} if force else load_index(project_dir)
    files = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        # Skip directories
        if any(skip in path.parts for skip in SKIP_DIRS):
            continue
        # Skip by extension
        if path.suffix.lower() not in exts:
            continue
        # Skip large files (>500KB)
        if path.stat().st_size > 500_000:
            continue
        # Incremental: skip unchanged files
        rel = str(path.relative_to(root))
        current_hash = file_hash(path)
        if not force and index.get(rel) == current_hash:
            continue
        files.append(path)

    return files


def get_embedding_model():
    """Load the sentence-transformer model."""
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("nomic-ai/nomic-embed-text-v1.5", trust_remote_code=True)
