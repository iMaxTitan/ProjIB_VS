-- Performance indexes for top PostgREST workloads (activity feed, plans, tasks, presence)

-- 1) Activity feed hot paths
CREATE INDEX IF NOT EXISTS idx_activities_created_at_desc
  ON public.activities (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_target_daily_task
  ON public.activities (target_type, target_id)
  WHERE target_type = 'daily_task';

CREATE INDEX IF NOT EXISTS idx_daily_tasks_created_at_desc
  ON public.daily_tasks (created_at DESC);

-- Supports: WHERE monthly_plan_id = ? ORDER BY task_date DESC
CREATE INDEX IF NOT EXISTS idx_daily_tasks_monthly_plan_task_date_desc
  ON public.daily_tasks (monthly_plan_id, task_date DESC);

-- Supports: WHERE user_id = ? AND task_date = ?
CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_task_date
  ON public.daily_tasks (user_id, task_date);

-- 2) Plans/read models hot paths
CREATE INDEX IF NOT EXISTS idx_monthly_plans_quarterly_month
  ON public.monthly_plans (quarterly_id, month);

CREATE INDEX IF NOT EXISTS idx_monthly_plans_year_month_status
  ON public.monthly_plans (year, month, status);

CREATE INDEX IF NOT EXISTS idx_annual_plans_year_desc
  ON public.annual_plans (year DESC);

-- 3) Presence/users hot paths
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen_at_desc
  ON public.user_profiles (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_profiles_status_full_name
  ON public.user_profiles (status, full_name);
