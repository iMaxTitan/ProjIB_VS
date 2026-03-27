#!/usr/bin/env python3
"""Semantic search across project memory (code chunks + insights)."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import get_memory_dir, get_embedding_model, get_insights_db


def search_vectors(project_dir: str, query: str, top_k: int = 5, chunk_type: str = None) -> list:
    """Search LanceDB for relevant code/text chunks."""
    import lancedb

    db_path = str(get_memory_dir(project_dir) / "vectors")
    db = lancedb.connect(db_path)

    if "project_chunks" not in db.table_names():
        return []

    table = db.open_table("project_chunks")

    # Encode query with search prefix
    model = get_embedding_model()
    query_vec = model.encode([f"search_query: {query}"])[0].tolist()

    # Search
    results = table.search(query_vec).limit(top_k * 2).to_list()

    # Filter by type if specified
    if chunk_type:
        if chunk_type == "code":
            results = [r for r in results if r["source"] == "code" and r["chunk_type"] != "text"]
        elif chunk_type == "text":
            results = [r for r in results if r["chunk_type"] == "text"]

    return results[:top_k]


def search_insights(project_dir: str, query: str, top_k: int = 5) -> list:
    """Search insights using embedding similarity."""
    import lancedb

    db_path = str(get_memory_dir(project_dir) / "vectors")
    db = lancedb.connect(db_path)

    if "insights" not in db.table_names():
        # Fallback: text search in SQLite
        conn = get_insights_db(project_dir)
        cursor = conn.execute(
            "SELECT id, category, text, created_at FROM insights ORDER BY created_at DESC LIMIT ?",
            (top_k,)
        )
        return [dict(row) for row in cursor.fetchall()]

    table = db.open_table("insights")
    model = get_embedding_model()
    query_vec = model.encode([f"search_query: {query}"])[0].tolist()
    results = table.search(query_vec).limit(top_k).to_list()
    return results


def main():
    parser = argparse.ArgumentParser(description="Search project memory")
    parser.add_argument("--project-dir", required=True, help="Project root directory")
    parser.add_argument("--query", required=True, help="Search query")
    parser.add_argument("--top-k", type=int, default=5, help="Number of results")
    parser.add_argument("--type", choices=["code", "text", "insight", "all"], default="all",
                        help="Type of results to search")
    args = parser.parse_args()

    results = {"code_chunks": [], "insights": []}

    if args.type in ("code", "text", "all"):
        chunk_type = args.type if args.type in ("code", "text") else None
        vector_results = search_vectors(args.project_dir, args.query, args.top_k, chunk_type)
        for r in vector_results:
            results["code_chunks"].append({
                "file": r.get("file_path", ""),
                "name": r.get("name", ""),
                "type": r.get("chunk_type", ""),
                "language": r.get("language", ""),
                "lines": f"{r.get('start_line', 0)}-{r.get('end_line', 0)}",
                "score": round(1 - r.get("_distance", 0), 4),
                "text": r.get("text", "")[:2000],
            })

    if args.type in ("insight", "all"):
        insight_results = search_insights(args.project_dir, args.query, args.top_k)
        for r in insight_results:
            results["insights"].append({
                "id": r.get("id", ""),
                "category": r.get("category", ""),
                "text": r.get("text", "")[:2000],
                "created_at": r.get("created_at", ""),
            })

    # Output as JSON for Claude to parse
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
