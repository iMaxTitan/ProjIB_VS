#!/usr/bin/env python3
"""Delete an insight from project memory."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import get_memory_dir, get_insights_db


def main():
    parser = argparse.ArgumentParser(description="Delete an insight")
    parser.add_argument("--project-dir", required=True, help="Project root directory")
    parser.add_argument("--id", type=int, required=True, help="Insight ID to delete")
    args = parser.parse_args()

    conn = get_insights_db(args.project_dir)

    # Check exists
    row = conn.execute("SELECT id, text FROM insights WHERE id = ?", (args.id,)).fetchone()
    if not row:
        print(json.dumps({"status": "error", "message": f"Insight {args.id} not found"}))
        return

    conn.execute("DELETE FROM insights WHERE id = ?", (args.id,))
    conn.commit()

    # Also remove from vector DB
    try:
        import lancedb
        db_path = str(get_memory_dir(args.project_dir) / "vectors")
        db = lancedb.connect(db_path)
        if "insights" in db.table_names():
            table = db.open_table("insights")
            table.delete(f"id = {args.id}")
    except Exception:
        pass

    print(json.dumps({
        "status": "deleted",
        "id": args.id,
        "text": dict(row)["text"][:100],
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
