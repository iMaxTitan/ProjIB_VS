#!/usr/bin/env python3
"""Save an insight/decision to project memory."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import get_memory_dir, get_embedding_model, get_insights_db


def main():
    parser = argparse.ArgumentParser(description="Save insight to project memory")
    parser.add_argument("--project-dir", required=True, help="Project root directory")
    parser.add_argument("--category", required=True,
                        choices=["decision", "architecture", "bug", "convention", "todo", "context"],
                        help="Category of insight")
    parser.add_argument("--text", required=True, help="The insight text to save")
    args = parser.parse_args()

    # Save to SQLite
    conn = get_insights_db(args.project_dir)
    cursor = conn.execute(
        "INSERT INTO insights (category, text) VALUES (?, ?)",
        (args.category, args.text)
    )
    insight_id = cursor.lastrowid
    conn.commit()

    # Also save embedding to LanceDB for semantic search
    try:
        import lancedb
        model = get_embedding_model()
        embedding = model.encode([f"search_document: {args.text}"])[0].tolist()

        db_path = str(get_memory_dir(args.project_dir) / "vectors")
        db = lancedb.connect(db_path)

        data = [{
            "vector": embedding,
            "text": args.text,
            "file_path": "",
            "language": "",
            "chunk_type": "insight",
            "name": args.category,
            "start_line": 0,
            "end_line": 0,
            "source": "insight",
            "id": insight_id,
            "category": args.category,
        }]

        if "insights" in db.table_names():
            table = db.open_table("insights")
            table.add(data)
        else:
            db.create_table("insights", data)
    except Exception as e:
        print(f"Warning: saved to SQLite but vector indexing failed: {e}", file=sys.stderr)

    result = {
        "status": "saved",
        "id": insight_id,
        "category": args.category,
        "text": args.text[:200],
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
