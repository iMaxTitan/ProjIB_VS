---
name: code-check
description: "Run Codex CLI to verify code changes made by Claude Code. Use this skill AUTOMATICALLY after completing significant code changes — new files, refactors, pipeline changes, or anything touching more than 3 files. Also use when the user says 'check', 'verify', 'review code', or when you want a second opinion before reporting 'done' to the user. This is your quality gate — Codex catches bugs you miss."
---

# Code Check — Codex Reviews Claude's Work

After you (Claude Code) make code changes, this skill invokes Codex CLI to independently verify your work. Think of it as your pair programmer checking over your shoulder.

## When to Use

- AUTOMATICALLY after writing/editing 3+ files
- After any change to KB pipeline (prefix, search, synthesizer, eval)
- After database schema changes
- When the user asks to verify/check/review
- When you're not 100% confident in your changes

## Execution Steps

### Step 1: Get the diff

Run `git diff --stat` and `git diff` to capture what changed.

### Step 2: Run Codex review

Execute via Bash:

```bash
DIFF=$(git diff --stat)
DIFF_FULL=$(git diff | head -800)

codex exec --ephemeral -C "C:\Proj\ProjIB_VS" -o CODEX_CHECK.md "You are a senior TypeScript/Next.js code reviewer.

PROJECT: CS Platform — Next.js 15 + React 19 + TypeScript strict + PostgreSQL 16 + PostgREST + pgvector.
See CLAUDE.md for module boundaries and rules.

CHANGED FILES:
$DIFF

DIFF (first 800 lines):
$DIFF_FULL

REVIEW CHECKLIST:
1. BUGS: Type errors, null/undefined, race conditions, off-by-one
2. SECURITY: Injection, auth bypass, secret leaks, XSS
3. MODULE BOUNDARIES: Does the change respect lib/ and components/ boundaries from CLAUDE.md?
4. ANTI-PATTERNS: console.log (use logger), createClient() (use getServerDb), inline styles
5. MISSING: Error handling at system boundaries, rate limiting on new API routes
6. LOGIC: Does the code actually do what it's supposed to? Edge cases?
7. FILE SIZE: Any file over 300 lines (services) or 400 lines (components)?

RESPONSE FORMAT:
If no issues: respond with exactly 'LGTM ✅'
If issues found:
🔴 BUGS (must fix):
- file:line — description

🟡 WARNINGS (should fix):
- file:line — description

🟢 SUGGESTIONS (optional):
- file:line — description

Be specific. Don't flag style preferences — only real issues."
```

### Step 3: Read and act on results

Read `CODEX_CHECK.md` from project root.

- **LGTM**: Report to user that code passed external review.
- **BUGS (🔴)**: Fix them immediately before reporting to user.
- **WARNINGS (🟡)**: Fix if quick, otherwise tell user about them.
- **SUGGESTIONS (🟢)**: Mention to user, don't auto-fix.

### Step 4: Report

Tell the user:
- What Codex found (or that it said LGTM)
- What you fixed based on the review
- Any remaining warnings the user should know about

## Important Notes

- CODEX_CHECK.md is gitignored — don't commit it
- If Codex CLI fails (timeout, not installed), skip silently and tell the user
- Don't argue with Codex findings — fix bugs, explain disagreements to the user
- Max timeout: 120 seconds
