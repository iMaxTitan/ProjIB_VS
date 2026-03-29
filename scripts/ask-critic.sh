#!/bin/bash
# ask-critic.sh — Ask Codex (architect/critic) for feedback
# Usage: bash scripts/ask-critic.sh "question or problem description"
#
# Codex gets full project context and acts as external architect/critic.
# Output saved to CRITIC_RESPONSE.md for Claude Code to read.

set -euo pipefail

QUESTION="${1:?Usage: bash scripts/ask-critic.sh \"question\"}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$PROJECT_DIR/CRITIC_RESPONSE.md"

# Build context
CONTEXT="You are a senior RAG/IR architect reviewing a production knowledge base system.

PROJECT: Corporate KB for Ukraine's largest retail chain (ATB-Market, ~1000 stores).
Stack: Next.js + PostgreSQL pgvector + Voyage AI embeddings + Claude/Gemini synthesis.

KEY FILES:
- Prefix pipeline: src/lib/kb/prefix-pipeline.ts (L1 Gemini / L2 Haiku cascade)
- Search: src/lib/kb/search.ts (vector+BM25 RRF, scope filter, reranker)
- Synthesizer: src/lib/kb/synthesizer.ts (extract Gemini + compose Haiku + audience filter)
- Validator: src/lib/kb/prefix-validator.ts (confidence scoring)
- Eval: src/lib/kb/eval/test-cases.json + scripts/kb-eval.ts

CURRENT EVAL BASELINE:
  Recall@10: 0.786 (target ≥0.90)
  MRR@10: 0.500 (target ≥0.70)
  WrongScope@3: 1/20 (target 0)
  KeywordHit: 0.863 (target ≥0.80)
  NegativeHit: 0/20 ✅

RULES FOR YOUR RESPONSE:
1. Be specific — file:line references, exact code changes, concrete thresholds.
2. No generic advice — every recommendation must be actionable.
3. State what NOT to do (anti-patterns for this specific system).
4. Prioritize by impact: P0 (blocking) > P1 (important) > P2 (nice-to-have).
5. If the question is about architecture — give decision tree, not just options.
6. Consider cost: Gemini Flash-Lite \$0.25/1M, Haiku \$1/\$5 per 1M in/out.
7. Respond in Russian."

echo "[Codex Critic] Analyzing: $QUESTION"
echo "[Codex Critic] Project: $PROJECT_DIR"

codex exec \
  --ephemeral \
  -C "$PROJECT_DIR" \
  -o "$OUTPUT" \
  "$CONTEXT

QUESTION:
$QUESTION" 2>/dev/null || {
    echo "❌ Codex failed. Check codex installation."
    exit 1
  }

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Critic response saved to: CRITIC_RESPONSE.md"
echo "═══════════════════════════════════════════════════════"
echo ""
head -20 "$OUTPUT"
echo "..."
echo ""
echo "To feed to Claude Code: cat CRITIC_RESPONSE.md"
