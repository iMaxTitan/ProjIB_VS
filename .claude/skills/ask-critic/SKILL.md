---
name: ask-critic
description: "Invoke Codex CLI as an external architecture critic for code review, architecture decisions, and pipeline design questions. Use this skill whenever you (Claude Code) have a question about architecture, design decisions, tradeoffs, or need an independent review of code changes — instead of asking the user. Triggers: /ask-critic, 'ask the critic', 'get external review', 'what would the critic say', or when you're unsure about an architectural decision and would normally ask the user."
---

# Ask Critic — External Architecture Review via Codex CLI

You are about to invoke an external AI critic (OpenAI Codex CLI) to get an independent architectural review or answer to a technical question. This is your "second opinion" tool — use it instead of asking the user when you have architecture/design questions.

## When to Use

- You're unsure about an architectural decision
- You want a code review before presenting changes to the user
- You need to evaluate tradeoffs between approaches
- You want to validate that your implementation matches best practices
- The user explicitly asks you to consult the critic

## How It Works

1. You formulate the question with full project context
2. Run Codex CLI in non-interactive mode
3. Read the response from CRITIC_RESPONSE.md
4. Apply the feedback to your work

## Execution Steps

### Step 1: Build the question

Take the user's question (from `/ask-critic "question"` args) or formulate your own based on what you need reviewed.

### Step 2: Run Codex

Execute this command via Bash tool:

```bash
codex exec --ephemeral -C "C:\Proj\ProjIB_VS" -o CRITIC_RESPONSE.md "You are a senior RAG/IR architect reviewing a production knowledge base system.

PROJECT: Corporate KB for Ukraine's largest retail chain (ATB-Market, ~1000 stores).
Stack: Next.js 15 + PostgreSQL 16 + pgvector + Voyage AI embeddings + Claude Haiku / Gemini Flash-Lite synthesis.

ARCHITECTURE:
- Prefix pipeline: L1 Gemini Flash-Lite (99%) + L2 Haiku fallback, with deterministic synonym dict (kb_synonym_dict), JSON validation, scope tagging
- Search: vector + BM25 RRF → scope filter → Voyage rerank-2.5 → audience filter → synthesis
- Synthesizer: Extract (Gemini Flash-Lite, fallback Haiku) → Applicability Filter → Compose (Haiku)
- Eval: Recall@10, MRR@10, WrongScope@3, KeywordHit, NegativeHit

CURRENT METRICS:
  Recall@10: 0.786 (target ≥0.90)
  MRR@10: 0.500 (target ≥0.70)
  WrongScope@3: 1/20 (target 0)
  KeywordHit: 0.863
  NegativeHit: 0/20

RULES FOR YOUR RESPONSE:
1. Be specific — file:line references, exact code changes, concrete thresholds.
2. No generic advice — every recommendation must be actionable.
3. State what NOT to do (anti-patterns for this specific system).
4. Prioritize: P0 (blocking) > P1 (important) > P2 (nice-to-have).
5. Consider cost: Gemini Flash-Lite ~$0.25/1M, Haiku $1/$5 per 1M in/out.
6. Respond in Russian.

QUESTION:
<QUESTION_HERE>"
```

Replace `<QUESTION_HERE>` with the actual question.

### Step 3: Read Response

After the command completes, read `CRITIC_RESPONSE.md` from the project root using the Read tool.

### Step 4: Apply

Summarize the critic's response to the user and explain what you plan to do based on it. If the critic identified issues, fix them. If the critic approved, proceed with confidence.

## Important Notes

- The critic runs in ephemeral mode — no state is saved between calls
- Timeout: allow up to 120 seconds for complex questions
- If Codex fails, tell the user and proceed with your own judgment
- Always show the user what the critic said — don't hide disagreements
- The CRITIC_RESPONSE.md file is gitignored — don't commit it
