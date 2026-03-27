---
name: project-memory
description: >
  RAG-based persistent project memory that indexes code and saves decisions/insights across conversations.
  Uses AST-aware chunking, vector search (LanceDB), and structured storage (SQLite).
  Use this skill whenever the user asks to remember something about the project, recall past decisions,
  search project context, index the codebase, or when answering questions that require deep project knowledge.
  Also trigger when the user says things like "remember this", "what did we decide about...",
  "find where we...", "index the project", "update memory", or any request involving project history and context.
---

# Project Memory — RAG-based persistent memory for your codebase

This skill gives you persistent, semantic memory across conversations. It indexes project files using AST-aware chunking and stores embeddings in a local vector database. It also stores decisions, insights, and context in a structured database.

## Setup (first time only)

If the user hasn't set up project-memory yet, run the setup script:

```bash
python <skill-path>/scripts/setup.py
```

This installs dependencies and downloads the embedding model. It only needs to run once.

`<skill-path>` is the directory where this SKILL.md lives: `.claude/skills/project-memory`

**Project root:** `C:\Proj\ProjIB_VS` (use this as `<project-root>` for all commands)

## Core Commands

### 1. Index the project

When the user asks to index/scan/remember the project:

```bash
python <skill-path>/scripts/index_project.py --project-dir <project-root>
```

This will:
- Parse code files using Tree-sitter (AST-aware chunking by functions/classes)
- Parse text files (markdown, configs) using semantic chunking
- Generate embeddings via Nomic Embed
- Store everything in LanceDB at `<project-root>/.project-memory/vectors/`
- Skip files matching `.gitignore`, binary files, `node_modules`, `.git`, etc.

Options:
- `--force` — re-index everything (default: only changed files)
- `--extensions .py,.js,.ts,.md` — limit to specific extensions

### 2. Search project memory

When the user asks a question about the project, or you need context:

```bash
python <skill-path>/scripts/search_memory.py --project-dir <project-root> --query "how does auth work"
```

Options:
- `--top-k 10` — number of results (default: 5)
- `--type code` — search only code chunks
- `--type insight` — search only saved insights/decisions

Returns relevant code chunks and insights ranked by semantic similarity.

### 3. Save an insight or decision

When the user says "remember this" or you learn something important about the project:

```bash
python <skill-path>/scripts/save_insight.py --project-dir <project-root> --category decision --text "We chose LanceDB over ChromaDB because..."
```

Categories: `decision`, `architecture`, `bug`, `convention`, `todo`, `context`

### 4. List saved insights

```bash
python <skill-path>/scripts/list_insights.py --project-dir <project-root>
```

Options:
- `--category decision` — filter by category

### 5. Forget/delete an insight

```bash
python <skill-path>/scripts/forget_insight.py --project-dir <project-root> --id <insight-id>
```

## When to use this skill

- **Before answering complex questions** about the project — search memory first for relevant context
- **When the user says "remember"** — save an insight
- **At the start of a conversation** about an indexed project — search for recent insights to restore context
- **When the user asks "what did we decide about X"** — search insights
- **When you need to find related code** — semantic search is more powerful than grep for conceptual queries

## How data is stored

All data lives in `<project-root>/.project-memory/`:
```
.project-memory/
├── vectors/       — LanceDB vector database (code embeddings)
├── insights.db    — SQLite database (decisions, context, conventions)
└── index.json     — file hashes for incremental indexing
```

Add `.project-memory/` to `.gitignore` — it's local and regenerable.

## Supported languages (Tree-sitter AST chunking)

Python, JavaScript, TypeScript, Go, Rust, Java, C, C++, Ruby, PHP, C#, Swift, Kotlin.

Other file types fall back to semantic text chunking.
