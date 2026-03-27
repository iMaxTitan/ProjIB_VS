#!/usr/bin/env python3
"""List saved insights from project memory."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import get_insights_db


def main():
    parser = argparse.ArgumentParser(description="List saved insights")
    parser.add_argument("--project-dir", required=True, help="Project root directory")
    parser.add_argument("--category", type=str, default=None, help="Filter by category")
    args = parser.parse_args()

    conn = get_insights_db(args.project_dir)

    if args.category:
        cursor = conn.execute(
            "SELECT id, category, text, created_at FROM insights WHERE category = ? ORDER BY created_at DESC",
            (args.category,)
        )
    else:
        cursor = conn.execute(
            "SELECT id, category, text, created_at FROM insights ORDER BY created_at DESC"
        )

    insights = [dict(row) for row in cursor.fetchall()]
    print(json.dumps({"insights": insights, "total": len(insights)}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
