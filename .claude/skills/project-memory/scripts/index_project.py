#!/usr/bin/env python3
"""Index project files into LanceDB with AST-aware chunking."""

import argparse
import sys
import time
from pathlib import Path

# Add scripts dir to path
sys.path.insert(0, str(Path(__file__).parent))

from common import (
    collect_files, file_hash, get_memory_dir, load_index, save_index,
    get_embedding_model, CODE_EXTENSIONS, TEXT_EXTENSIONS, ALL_EXTENSIONS,
)
from chunker import chunk_code_file, chunk_text_file


def main():
    parser = argparse.ArgumentParser(description="Index project files into vector DB")
    parser.add_argument("--project-dir", required=True, help="Project root directory")
    parser.add_argument("--force", action="store_true", help="Re-index all files")
    parser.add_argument("--extensions", type=str, default=None,
                        help="Comma-separated extensions to index (e.g. .py,.js,.md)")
    args = parser.parse_args()

    project_dir = args.project_dir
    mem_dir = get_memory_dir(project_dir)
    root = Path(project_dir)

    # Parse extensions
    exts = None
    if args.extensions:
        exts = {e.strip() if e.strip().startswith(".") else f".{e.strip()}"
                for e in args.extensions.split(",")}

    print(f"Indexing project: {project_dir}")
    start = time.time()

    # Collect files to index
    files = collect_files(project_dir, extensions=exts, force=args.force)
    if not files:
        print("No new or changed files to index.")
        return

    print(f"Found {len(files)} files to index...")

    # Chunk all files
    all_chunks = []
    for filepath in files:
        suffix = filepath.suffix.lower()
        if suffix in CODE_EXTENSIONS:
            chunks = chunk_code_file(filepath)
        else:
            chunks = chunk_text_file(filepath)

        # Add relative path prefix to chunk text for context
        rel_path = filepath.relative_to(root)
        for chunk in chunks:
            chunk.file_path = str(rel_path)
        all_chunks.extend(chunks)

    if not all_chunks:
        print("No chunks extracted.")
        return

    print(f"Extracted {len(all_chunks)} chunks. Generating embeddings...")

    # Generate embeddings
    model = get_embedding_model()
    # Prefix texts with "search_document: " as required by nomic-embed
    texts = [f"search_document: {c.text[:2000]}" for c in all_chunks]

    # Batch encode
    embeddings = model.encode(texts, show_progress_bar=True, batch_size=32)

    print(f"Storing in LanceDB...")

    # Prepare data for LanceDB
    import lancedb
    import pyarrow as pa

    data = []
    for i, chunk in enumerate(all_chunks):
        data.append({
            "vector": embeddings[i].tolist(),
            "text": chunk.text[:5000],  # Limit stored text
            "file_path": chunk.file_path,
            "language": chunk.language,
            "chunk_type": chunk.chunk_type,
            "name": chunk.name or "",
            "start_line": chunk.start_line,
            "end_line": chunk.end_line,
            "source": "code",
        })

    # Open/create LanceDB
    db_path = str(mem_dir / "vectors")
    db = lancedb.connect(db_path)

    table_name = "project_chunks"
    tables = db.table_names() if hasattr(db, 'table_names') else [t.name for t in db.list_tables()]
    if args.force and table_name in tables:
        db.drop_table(table_name)
        tables = db.table_names() if hasattr(db, 'table_names') else [t.name for t in db.list_tables()]

    if table_name in tables:
        table = db.open_table(table_name)
        # Remove old chunks for files being re-indexed
        reindexed_files = {str(f.relative_to(root)) for f in files}
        for rel_file in reindexed_files:
            try:
                table.delete(f'file_path = "{rel_file}"')
            except Exception:
                pass
        table.add(data)
    else:
        db.create_table(table_name, data)

    # Update file hash index
    index = load_index(project_dir)
    for filepath in files:
        rel = str(filepath.relative_to(root))
        index[rel] = file_hash(filepath)
    save_index(project_dir, index)

    elapsed = time.time() - start
    print(f"\nDone! Indexed {len(all_chunks)} chunks from {len(files)} files in {elapsed:.1f}s")
    print(f"Database: {db_path}")


if __name__ == "__main__":
    main()
