---
name: supabase-postgres
description: "Supabase Postgres best practices - performance optimization, RLS security, indexing, connection pooling. Use when writing SQL, designing schemas, reviewing queries, or implementing RLS policies."
---

# Supabase Postgres Best Practices

## Overview

Comprehensive Postgres performance optimization guidelines for Supabase projects. Apply these rules when:
- Writing SQL queries
- Designing database schemas
- Implementing Row-Level Security (RLS)
- Reviewing performance issues
- Configuring connection pooling

## Priority Categories

| Priority | Category | Impact |
|----------|----------|--------|
| CRITICAL | Query Performance | 100-1000x improvement |
| CRITICAL | Connection Management | 10-100x more users |
| CRITICAL | Security & RLS | Data protection |
| HIGH | Schema Design | 10-100x faster JOINs |
| MEDIUM-HIGH | Concurrency & Locking | Deadlock prevention |
| MEDIUM | Data Access Patterns | 10-100x fewer round trips |

---

## 1. Query Performance (CRITICAL)

### Always Index WHERE and JOIN Columns

**Problem:** Unindexed columns cause full table scans.

```sql
-- BAD: No index on customer_id
SELECT * FROM orders WHERE customer_id = 123;
-- Seq Scan: cost=0.00..25000.00

-- GOOD: Create index
CREATE INDEX orders_customer_id_idx ON orders (customer_id);
-- Index Scan: cost=0.00..8.44
```

### Use Composite Indexes for Multi-Column Queries

**Rule:** Place equality columns first, range columns last.

```sql
-- Query: WHERE status = 'active' AND created_at > '2024-01-01'
CREATE INDEX orders_status_created_idx ON orders (status, created_at);
```

### Index Types

- **B-tree** (default): Equality and range queries
- **GIN**: Arrays, JSONB, full-text search
- **GiST**: Geometric data, full-text search
- **BRIN**: Large tables with natural ordering

```sql
-- JSONB indexing
CREATE INDEX posts_metadata_gin ON posts USING gin (metadata);

-- Full-text search
CREATE INDEX posts_search_idx ON posts USING gin (to_tsvector('english', title || ' ' || body));
```

---

## 2. Connection Management (CRITICAL)

### Always Use Connection Pooling

**Problem:** Each Postgres connection uses 1-3MB RAM. Direct connections exhaust resources.

**Solution:** Use PgBouncer (built into Supabase).

```
Pool size formula: (CPU cores × 2) + spindle_count
4-core system = ~10 connections serving hundreds of users
```

### Pool Modes

- **Transaction mode**: Returns connection after each transaction (recommended)
- **Session mode**: Maintains connection for entire session (for prepared statements)

### Idle Connection Timeout

```sql
-- Set statement timeout
SET statement_timeout = '30s';

-- In Supabase: Configure in dashboard or connection string
```

---

## 3. Security & RLS (CRITICAL)

### Enable RLS on All Tables with User Data

```sql
-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
```

### Create Policies with auth.uid()

```sql
-- Users can only see their own orders
CREATE POLICY "Users see own orders" ON orders
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can only insert their own orders
CREATE POLICY "Users insert own orders" ON orders
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

### RLS Performance Optimization (CRITICAL)

**Problem:** `auth.uid()` called for every row = slow.

```sql
-- BAD: Function called per row
CREATE POLICY "slow_policy" ON orders
  FOR SELECT USING (user_id = auth.uid());

-- GOOD: Wrap in subquery (100x faster)
CREATE POLICY "fast_policy" ON orders
  FOR SELECT USING (user_id = (SELECT auth.uid()));
```

### Always Index RLS Columns

```sql
CREATE INDEX orders_user_id_idx ON orders (user_id);
```

---

## 4. Schema Design (HIGH)

### Always Index Foreign Keys

**Postgres does NOT auto-index FKs!**

```sql
-- When you create FK:
ALTER TABLE orders ADD CONSTRAINT fk_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id);

-- ALWAYS add index:
CREATE INDEX orders_customer_id_idx ON orders (customer_id);
```

### Find Missing FK Indexes

```sql
SELECT
  c.conrelid::regclass AS table_name,
  a.attname AS fk_column
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND a.attnum = ANY(i.indkey)
  );
```

### Use Appropriate Data Types

```sql
-- Use UUID for primary keys
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);

-- Use TIMESTAMPTZ not TIMESTAMP
created_at TIMESTAMPTZ DEFAULT now()

-- Use TEXT not VARCHAR (no performance difference in Postgres)
name TEXT NOT NULL
```

### Use Lowercase Identifiers

```sql
-- BAD: Requires quotes forever
CREATE TABLE "UserOrders" ("OrderId" INT);

-- GOOD: No quotes needed
CREATE TABLE user_orders (order_id INT);
```

---

## 5. Concurrency & Locking (MEDIUM-HIGH)

### Keep Transactions Short

```sql
-- BAD: Long transaction holding locks
BEGIN;
  SELECT * FROM orders; -- Acquires locks
  -- ... application logic takes 30 seconds ...
  UPDATE orders SET status = 'processed';
COMMIT;

-- GOOD: Minimal transaction
BEGIN;
  UPDATE orders SET status = 'processed' WHERE id = 123;
COMMIT;
```

### Prevent Deadlocks with Consistent Lock Order

```sql
-- Always lock tables in the same order across all code
-- Alphabetical order is a common convention
BEGIN;
  LOCK TABLE accounts IN SHARE MODE;
  LOCK TABLE orders IN SHARE MODE;
  -- ... operations ...
COMMIT;
```

### Use SKIP LOCKED for Queue Processing

```sql
-- Worker pattern without blocking
SELECT * FROM jobs
WHERE status = 'pending'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

---

## 6. Data Access Patterns (MEDIUM)

### Eliminate N+1 Queries

**Problem:** 1 query + N queries per result = slow.

```sql
-- BAD: Loop queries
for user in users:
  orders = query("SELECT * FROM orders WHERE user_id = ?", user.id)

-- GOOD: Batch query
SELECT * FROM orders WHERE user_id = ANY($1::uuid[]);

-- GOOD: JOIN
SELECT u.*, o.*
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.id = ANY($1::uuid[]);
```

### Use Cursor-Based Pagination

```sql
-- BAD: OFFSET gets slower as pages increase
SELECT * FROM orders ORDER BY id LIMIT 20 OFFSET 10000;

-- GOOD: Cursor-based (consistently fast)
SELECT * FROM orders
WHERE id > $last_seen_id
ORDER BY id
LIMIT 20;
```

### Use UPSERT for Insert-or-Update

```sql
INSERT INTO products (sku, name, price)
VALUES ('ABC123', 'Widget', 9.99)
ON CONFLICT (sku)
DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price;
```

### Batch Inserts

```sql
-- BAD: Multiple INSERT statements
INSERT INTO logs (msg) VALUES ('a');
INSERT INTO logs (msg) VALUES ('b');
INSERT INTO logs (msg) VALUES ('c');

-- GOOD: Single multi-row INSERT
INSERT INTO logs (msg) VALUES ('a'), ('b'), ('c');

-- Or use COPY for bulk loading
COPY logs (msg) FROM STDIN;
```

---

## 7. Monitoring & Diagnostics (LOW-MEDIUM)

### Use EXPLAIN ANALYZE

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders WHERE customer_id = 123;
```

**Look for:**
- Seq Scan on large tables (needs index)
- High actual rows vs estimated rows (stale stats)
- Nested Loop with many iterations (consider JOIN strategy)

### Enable pg_stat_statements

```sql
-- View slow queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Run VACUUM ANALYZE

```sql
-- Update statistics for query planner
ANALYZE orders;

-- Reclaim dead tuple space
VACUUM orders;

-- Both together
VACUUM ANALYZE orders;
```

---

## 8. Advanced Features (LOW)

### JSONB Indexing

```sql
-- Index specific path
CREATE INDEX idx_metadata_status ON orders ((metadata->>'status'));

-- GIN index for containment queries
CREATE INDEX idx_metadata_gin ON orders USING gin (metadata);

-- Query with index
SELECT * FROM orders WHERE metadata @> '{"status": "active"}';
```

### Full-Text Search

```sql
-- Create search column
ALTER TABLE posts ADD COLUMN search_vector tsvector;

-- Update trigger
CREATE FUNCTION posts_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', NEW.title || ' ' || NEW.body);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_search_update
  BEFORE INSERT OR UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_search_trigger();

-- Index
CREATE INDEX posts_search_idx ON posts USING gin (search_vector);

-- Query
SELECT * FROM posts WHERE search_vector @@ to_tsquery('english', 'postgres & performance');
```

---

## Quick Checklist

Before deploying any database changes:

- [ ] All WHERE/JOIN columns indexed?
- [ ] All foreign keys indexed?
- [ ] RLS enabled on user data tables?
- [ ] RLS policies use `(SELECT auth.uid())` pattern?
- [ ] RLS columns indexed?
- [ ] No N+1 queries in application code?
- [ ] Connection pooling configured?
- [ ] Transactions kept short?
- [ ] EXPLAIN ANALYZE shows Index Scans (not Seq Scans)?

---

## Supabase-Specific Notes

- **Supabase Auth**: Use `auth.uid()` in RLS policies
- **Supabase Realtime**: RLS applies to subscriptions too
- **Supabase Storage**: Has its own RLS policies
- **Connection String**: Use pooler URL for applications, direct URL for migrations
- **Dashboard**: pg_stat_statements available in Database > Query Performance

## References

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Performance Guide](https://supabase.com/docs/guides/platform/performance)
- [PostgreSQL EXPLAIN Documentation](https://www.postgresql.org/docs/current/using-explain.html)
