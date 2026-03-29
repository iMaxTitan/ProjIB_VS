#!/bin/bash
# agents-collab.sh — Claude Code (developer) + Codex (reviewer/architect)
# Usage: bash scripts/agents-collab.sh "task description"
#
# Flow:
#   1. Claude Code implements the task
#   2. Codex reviews changes and writes critique
#   3. Claude Code fixes based on critique
#   4. Codex final approval or more issues
#   Repeat until Codex says LGTM or max 3 rounds

set -euo pipefail

TASK="${1:?Usage: bash scripts/agents-collab.sh \"task description\"}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="/tmp/agents-collab-$$"
mkdir -p "$TMP_DIR"
MAX_ROUNDS=3

echo "═══════════════════════════════════════════════════════"
echo "  Agents Collaboration: Claude Code + Codex"
echo "  Task: $TASK"
echo "  Project: $PROJECT_DIR"
echo "  Max rounds: $MAX_ROUNDS"
echo "═══════════════════════════════════════════════════════"

for round in $(seq 1 $MAX_ROUNDS); do
  echo ""
  echo "──── Round $round/$MAX_ROUNDS ────"

  # Step 1: Claude Code implements/fixes
  echo "[Claude Code] Working on task..."
  if [ $round -eq 1 ]; then
    CLAUDE_PROMPT="$TASK

After making changes, run typecheck (npx tsc --noEmit) and fix any errors.
Output a brief summary of what you changed."
  else
    REVIEW=$(cat "$TMP_DIR/codex-review-$((round-1)).txt" 2>/dev/null || echo "no review")
    CLAUDE_PROMPT="Fix these issues from code review:

$REVIEW

After fixing, run typecheck and fix any errors.
Output a brief summary of what you fixed."
  fi

  claude -p "$CLAUDE_PROMPT" --output-format text > "$TMP_DIR/claude-output-$round.txt" 2>&1 || true
  echo "[Claude Code] Done. Output: $(wc -l < "$TMP_DIR/claude-output-$round.txt") lines"

  # Step 2: Get diff for reviewer
  DIFF=$(cd "$PROJECT_DIR" && git diff --stat 2>/dev/null || echo "no changes")
  DIFF_FULL=$(cd "$PROJECT_DIR" && git diff 2>/dev/null | head -500 || echo "no diff")

  # Step 3: Codex reviews
  echo "[Codex] Reviewing changes..."
  CODEX_PROMPT="You are a senior code reviewer for a Ukrainian retail company's knowledge base system.

Review these changes:

\`\`\`
$DIFF
\`\`\`

Full diff (first 500 lines):
\`\`\`
$DIFF_FULL
\`\`\`

Claude's summary of changes:
$(cat "$TMP_DIR/claude-output-$round.txt" | tail -30)

Rules:
1. Check for bugs, type errors, security issues
2. Check module boundaries (see CLAUDE.md)
3. Check for hardcoded values that should be configurable
4. Check that the implementation matches the task: $TASK

If everything looks good, respond with exactly: LGTM
If there are issues, list them clearly with file:line references.
Be specific — don't say 'improve X', say exactly what to change."

  codex exec --ephemeral -C "$PROJECT_DIR" -o "$TMP_DIR/codex-review-$round.txt" "$CODEX_PROMPT" 2>/dev/null || true
  echo "[Codex] Review: $(wc -l < "$TMP_DIR/codex-review-$round.txt") lines"

  # Step 4: Check if LGTM
  if grep -qi "LGTM" "$TMP_DIR/codex-review-$round.txt" 2>/dev/null; then
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  ✅ LGTM after round $round!"
    echo "═══════════════════════════════════════════════════════"
    cat "$TMP_DIR/codex-review-$round.txt"
    break
  fi

  echo "[Codex] Issues found, continuing to next round..."
  echo "--- Review preview ---"
  head -10 "$TMP_DIR/codex-review-$round.txt"
  echo "---"
done

# Cleanup
echo ""
echo "Logs in: $TMP_DIR"
echo "Done."
