-- Dynamic pivot view: plan × user × company with proportional hour distribution
-- Replaces JS-side calculateHourDistribution() for reporting purposes

-- 1. Performance indexes (before view creation)
CREATE INDEX IF NOT EXISTS idx_company_infrastructure_company_period
  ON company_infrastructure (company_id, period_year, period_month);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_monthly_plan_user
  ON daily_tasks (monthly_plan_id, user_id);

-- 2. View: pre-computed company shares + distributed hours
CREATE OR REPLACE VIEW v_plan_user_company_hours
WITH (security_invoker = on) AS
WITH plan_company_shares AS (
  SELECT
    mpc.monthly_plan_id,
    mpc.company_id,
    mp.distribution_type,
    mp.year,
    mp.month,
    COALESCE(ci.servers_count, 0)       AS servers,
    COALESCE(ci.workstations_count, 0)  AS workstations,
    ci.rate_per_hour,
    SUM(COALESCE(ci.servers_count, 0))
      OVER (PARTITION BY mpc.monthly_plan_id)   AS total_servers,
    SUM(COALESCE(ci.workstations_count, 0))
      OVER (PARTITION BY mpc.monthly_plan_id)   AS total_workstations,
    COUNT(*)
      OVER (PARTITION BY mpc.monthly_plan_id)   AS companies_count
  FROM monthly_plan_companies mpc
  JOIN monthly_plans mp ON mp.monthly_plan_id = mpc.monthly_plan_id
  LEFT JOIN company_infrastructure ci
    ON ci.company_id = mpc.company_id
    AND ci.period_year = mp.year
    AND ci.period_month = mp.month
),
shares AS (
  SELECT
    monthly_plan_id,
    company_id,
    rate_per_hour,
    CASE
      WHEN distribution_type = 'by_servers' AND total_servers > 0
        THEN servers::numeric / total_servers
      WHEN distribution_type = 'by_workstations' AND total_workstations > 0
        THEN workstations::numeric / total_workstations
      ELSE 1.0 / companies_count
    END AS company_share
  FROM plan_company_shares
)
SELECT
  dt.monthly_plan_id,
  dt.user_id,
  s.company_id,
  mp.year,
  mp.month,
  CEIL(mp.month::numeric / 3)::integer   AS quarter,
  mp.measure_id,
  s.company_share,
  ROUND(SUM(dt.spent_hours) * s.company_share, 2)  AS distributed_hours,
  ROUND(mp.planned_hours * s.company_share, 2)      AS planned_hours_share,
  COUNT(dt.daily_task_id)                            AS tasks_count,
  s.rate_per_hour,
  mp.status AS plan_status
FROM daily_tasks dt
JOIN monthly_plans mp
  ON mp.monthly_plan_id = dt.monthly_plan_id
  AND mp.status IN ('active', 'completed')
JOIN shares s
  ON s.monthly_plan_id = dt.monthly_plan_id
GROUP BY
  dt.monthly_plan_id, dt.user_id, s.company_id,
  mp.year, mp.month, mp.measure_id, mp.planned_hours,
  s.company_share, s.rate_per_hour, mp.status;

-- 3. Access control
GRANT SELECT ON v_plan_user_company_hours TO authenticated;
REVOKE SELECT ON v_plan_user_company_hours FROM anon;
REVOKE SELECT ON v_plan_user_company_hours FROM public;

-- 4. Documentation
COMMENT ON VIEW v_plan_user_company_hours IS
'Proportional distribution of task hours across companies based on plan distribution_type.
Share logic: by_servers → servers/total, by_workstations → ws/total, even → 1/N.
Plans without companies in monthly_plan_companies are excluded.
~2-3K rows total. Used by /api/reports/pivot.';
