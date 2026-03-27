-- Migration: Merge duplicate monthly_plans and add UNIQUE constraint
-- Problem: monthly_plans allows duplicate (quarterly_id, measure_id, year, month)
-- Fix: merge tasks/assignees/companies into the oldest plan, delete duplicates, add constraint

BEGIN;

-- Step 1: Move daily_tasks from duplicate plans to the keeper (oldest by created_at)
WITH duplicates AS (
  SELECT
    array_agg(monthly_plan_id ORDER BY created_at ASC) AS plan_ids
  FROM monthly_plans
  WHERE measure_id IS NOT NULL
  GROUP BY quarterly_id, measure_id, year, month
  HAVING count(*) > 1
)
UPDATE daily_tasks dt
SET monthly_plan_id = d.plan_ids[1]
FROM duplicates d
WHERE dt.monthly_plan_id = ANY(d.plan_ids[2:]);

-- Step 2a: Move assignees to keeper (skip if already exists on keeper)
WITH duplicates AS (
  SELECT
    array_agg(monthly_plan_id ORDER BY created_at ASC) AS plan_ids
  FROM monthly_plans
  WHERE measure_id IS NOT NULL
  GROUP BY quarterly_id, measure_id, year, month
  HAVING count(*) > 1
)
INSERT INTO monthly_plan_assignees (monthly_plan_id, user_id, assigned_at)
SELECT d.plan_ids[1], mpa.user_id, MIN(mpa.assigned_at)
FROM monthly_plan_assignees mpa
JOIN duplicates d ON mpa.monthly_plan_id = ANY(d.plan_ids[2:])
GROUP BY d.plan_ids[1], mpa.user_id
ON CONFLICT (monthly_plan_id, user_id) DO NOTHING;

-- Step 2b: Delete assignees from duplicate plans
WITH duplicates AS (
  SELECT
    array_agg(monthly_plan_id ORDER BY created_at ASC) AS plan_ids
  FROM monthly_plans
  WHERE measure_id IS NOT NULL
  GROUP BY quarterly_id, measure_id, year, month
  HAVING count(*) > 1
)
DELETE FROM monthly_plan_assignees mpa
USING duplicates d
WHERE mpa.monthly_plan_id = ANY(d.plan_ids[2:]);

-- Step 3a: Move companies to keeper (skip if already exists)
WITH duplicates AS (
  SELECT
    array_agg(monthly_plan_id ORDER BY created_at ASC) AS plan_ids
  FROM monthly_plans
  WHERE measure_id IS NOT NULL
  GROUP BY quarterly_id, measure_id, year, month
  HAVING count(*) > 1
)
INSERT INTO monthly_plan_companies (monthly_plan_id, company_id, created_at)
SELECT d.plan_ids[1], mpc.company_id, MIN(mpc.created_at)
FROM monthly_plan_companies mpc
JOIN duplicates d ON mpc.monthly_plan_id = ANY(d.plan_ids[2:])
GROUP BY d.plan_ids[1], mpc.company_id
ON CONFLICT (monthly_plan_id, company_id) DO NOTHING;

-- Step 3b: Delete companies from duplicate plans
WITH duplicates AS (
  SELECT
    array_agg(monthly_plan_id ORDER BY created_at ASC) AS plan_ids
  FROM monthly_plans
  WHERE measure_id IS NOT NULL
  GROUP BY quarterly_id, measure_id, year, month
  HAVING count(*) > 1
)
DELETE FROM monthly_plan_companies mpc
USING duplicates d
WHERE mpc.monthly_plan_id = ANY(d.plan_ids[2:]);

-- Step 4: Delete the duplicate monthly_plans (keep oldest)
WITH duplicates AS (
  SELECT
    array_agg(monthly_plan_id ORDER BY created_at ASC) AS plan_ids
  FROM monthly_plans
  WHERE measure_id IS NOT NULL
  GROUP BY quarterly_id, measure_id, year, month
  HAVING count(*) > 1
)
DELETE FROM monthly_plans mp
USING duplicates d
WHERE mp.monthly_plan_id = ANY(d.plan_ids[2:]);

-- Step 5: Add UNIQUE constraint
-- NULL measure_id is allowed multiple times per (quarterly_id, year, month) by design
ALTER TABLE monthly_plans
  ADD CONSTRAINT uq_monthly_plan_measure_period
  UNIQUE (quarterly_id, measure_id, year, month);

COMMIT;
