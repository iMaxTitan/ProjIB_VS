---
name: supabase-mcp
description: Management, troubleshooting, and best practices for the Supabase MCP server. Use this skill for project management, schema design, and query optimization.
---

# Supabase MCP Server & Database Skill

This skill provides instructions for managing the Supabase MCP server and applying Postgres best practices when interacting with the database.

## 🚀 How to Start the Server

```bash
npm run start:mcp
```

### Current Configuration
- **Command**: `mcp-server-supabase --access-token=sbp_...`
- **Important**: Do not use `--project-ref` (unsupported in v0.3.6).

## 🛠️ Available Tools

- `execute_sql`: Run raw SQL (use for DML and testing).
- `apply_migration`: Apply DDL migrations (use for schema changes).
- `list_tables`: Explore DB structure.
- `deploy_edge_function`: Manage logic.
- `get_logs`: Debug services (api, auth, postgres).

## 💡 Database Best Practices

Based on official Supabase guidelines, follow these patterns when designing or optimizing:

### 1. Query Performance (Critical)
- **Indexing**: Always ensure columns in joined orders or filtered clauses are indexed.
- **Explain**: Use `EXPLAIN ANALYZE` via `execute_sql` to diagnose slow queries.
- **Connection Management**: Use pooling for high-concurrency apps.

### 2. Schema Design (High)
- **Primary Keys**: Every table must have a primary key.
- **Foreign Keys**: Use FKs to maintain integrity; index them for performance on joins.
- **Data Types**: Choose the most efficient type (e.g., `text` over `varchar` if no limit is needed).

### 3. Security & RLS (Medium-High)
- **Row-Level Security**: Always enable RLS on public tables.
- **Policies**: Create granular `SELECT`, `INSERT`, `UPDATE`, `DELETE` policies.
- **Service Role**: Only use the service role for administrative scripts.

## 🔍 Optimization Patterns

When asked to optimize, use this sequence:
1. Examine the schema (`list_tables`).
2. Analyze the slow query (`EXPLAIN ANALYZE`).
3. Suggest missing indexes or query rewrites.
4. Apply changes via `apply_migration`.

## 📝 Troubleshooting
- **Handshake Error**: Ensure `initialize` is completed.
- **Permissions**: Verify `SUPABASE_ACCESS_TOKEN` has proper organization access.
