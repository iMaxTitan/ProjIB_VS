---
name: context7-mcp
description: Use the Context7 Documentation MCP server to retrieve up-to-date documentation and code examples for over 33,000 libraries.
---

# Context7 MCP Server Skill

Context7 (by Upstash) provides a searchable index of documentation for a vast number of programming libraries and frameworks.

## 🚀 How to Start the Server

Start the server using the project's `package.json` command:

```bash
npm run start:context7
```

### Current Configuration
The command runs:
`npx -y @upstash/context7-mcp`

> [!TIP]
> **API Key**: While not strictly required for basic use, you can set `CONTEXT7_API_KEY` in `.env.local` for higher rate limits. Get one at [context7.com/dashboard](https://context7.com/dashboard).

## 🛠️ Effective Usage Strategies

### 1. The "use context7" Trigger
Include **"use context7"** in your prompt to signal to the AI that it should look up documentation.
- *Example*: "Create a Next.js middleware that checks for JWTs in cookies. use context7"

### 2. Slash Syntax (Direct Loading)
If you know the library ID, use it directly with slash syntax to skip the discovery step.
- *Format*: `/owner/library` or `/owner/library/version`
- *Example*: "Implement authentication. use library /supabase/supabase for API and docs."

### 3. Automatic Invocation Rule
To avoid typing "use context7" every time, add a rule to your IDE (e.g., `CLAUDE.md` or Cursor Rule):
> "Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask."

### 4. Version Specificity
Just mention the version in your prompt (e.g., "Next.js 14") and Context7 will attempt to match the correct version.

## 🛠️ Available Tools

### 1. `resolve-library-id`
Resolves keywords to a specific Context7 library ID.
- **Parameters**: 
  - `query` (required): User's question or task (for relevance ranking).
  - `libraryName` (required): Name of the library to search for.

### 2. `query-docs`
Queries documentation for a library using a Context7 library ID.
- **Parameters**: 
  - `libraryId` (required): Exact Context7 ID (e.g., `/vercel/next.js`).
  - `query` (required): Specific question or task.
- **Limit**: Do not call more than 3 times per question.

## 🔍 Examples

1. **Discovery**: `resolve-library-id({ query: 'how to animate', libraryName: 'tailwindcss-animate' })`
2. **Deep Dive**: `query-docs({ libraryId: '/jamiebuilds/tailwindcss-animate', query: 'complex animation examples' })`

## 📝 Troubleshooting
- **Handshake Error**: Ensure `initialize` handshake is completed before calling tools.
- **Remote Option**: If the local server is unstable, a remote connection is available at `https://mcp.context7.com/mcp`.
