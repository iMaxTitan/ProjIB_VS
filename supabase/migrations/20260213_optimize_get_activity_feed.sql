-- Optimize RPC get_activity_feed:
-- - apply time window as early as possible
-- - apply role/department scope in SQL
-- - keep existing signature for PostgREST clients

CREATE OR REPLACE FUNCTION public.get_activity_feed(
  p_user_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_days_back integer DEFAULT 7,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  activity_id uuid,
  action_type text,
  target_type text,
  event_type text,
  event_time timestamptz,
  user_id uuid,
  user_name text,
  user_photo text,
  user_role text,
  department_id uuid,
  department_name text,
  event_description text,
  spent_hours numeric,
  plan_id text,
  plan_name text,
  plan_date text,
  quarterly_goal text,
  quarter integer,
  process_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH requester AS (
  SELECT
    COALESCE(up.role, 'chief') AS role,
    up.department_id AS department_id
  FROM public.user_profiles up
  WHERE up.user_id = p_user_id
),
activities_feed AS (
  SELECT
    a.activity_id,
    COALESCE(a.action_type, 'other') AS action_type,
    COALESCE(a.target_type, '') AS target_type,
    COALESCE(a.action_type, 'other') AS event_type,
    a.created_at AS event_time,
    a.user_id,
    COALESCE(u.full_name, u.email, 'Неизвестно') AS user_name,
    u.photo_base64 AS user_photo,
    u.role AS user_role,
    COALESCE(u.department_id, NULLIF(a.details ->> 'department_id', '')::uuid) AS department_id,
    COALESCE(du.department_name, dd.department_name, a.details ->> 'department_name', '') AS department_name,
    COALESCE(
      a.details ->> 'description',
      a.details ->> 'message',
      a.details ->> 'goal',
      a.details ->> 'expected_result',
      CONCAT(COALESCE(a.action_type, 'event'), ' ', COALESCE(a.target_type, ''))
    ) AS event_description,
    NULLIF(a.details ->> 'spent_hours', '')::numeric AS spent_hours,
    COALESCE(a.target_id::text, '') AS plan_id,
    COALESCE(a.details ->> 'plan_name', a.details ->> 'goal', '') AS plan_name,
    COALESCE(a.details ->> 'plan_date', a.created_at::text) AS plan_date,
    NULLIF(a.details ->> 'quarterly_goal', '') AS quarterly_goal,
    NULLIF(a.details ->> 'quarter', '')::integer AS quarter,
    NULLIF(a.details ->> 'process_name', '') AS process_name
  FROM public.activities a
  LEFT JOIN public.user_profiles u
    ON u.user_id = a.user_id
  LEFT JOIN public.departments du
    ON du.department_id = u.department_id
  LEFT JOIN public.departments dd
    ON dd.department_id = NULLIF(a.details ->> 'department_id', '')::uuid
  WHERE a.created_at >= NOW() - make_interval(days => GREATEST(COALESCE(p_days_back, 7), 1))
),
daily_tasks_feed AS (
  SELECT
    dt.daily_task_id AS activity_id,
    'create'::text AS action_type,
    'daily_task'::text AS target_type,
    'task_created'::text AS event_type,
    dt.created_at AS event_time,
    dt.user_id,
    COALESCE(u.full_name, u.email, 'Неизвестно') AS user_name,
    u.photo_base64 AS user_photo,
    u.role AS user_role,
    COALESCE(u.department_id, qp.department_id) AS department_id,
    COALESCE(du.department_name, dq.department_name, '') AS department_name,
    COALESCE(dt.description, mp.description, '') AS event_description,
    dt.spent_hours,
    dt.monthly_plan_id::text AS plan_id,
    COALESCE(mp.description, '') AS plan_name,
    dt.task_date::text AS plan_date,
    qp.goal AS quarterly_goal,
    qp.quarter,
    pr.process_name
  FROM public.daily_tasks dt
  LEFT JOIN public.user_profiles u
    ON u.user_id = dt.user_id
  LEFT JOIN public.departments du
    ON du.department_id = u.department_id
  LEFT JOIN public.monthly_plans mp
    ON mp.monthly_plan_id = dt.monthly_plan_id
  LEFT JOIN public.quarterly_plans qp
    ON qp.quarterly_id = mp.quarterly_id
  LEFT JOIN public.departments dq
    ON dq.department_id = qp.department_id
  LEFT JOIN public.measures ms
    ON ms.measure_id = mp.measure_id
  LEFT JOIN public.processes pr
    ON pr.process_id = ms.process_id
  WHERE dt.created_at >= NOW() - make_interval(days => GREATEST(COALESCE(p_days_back, 7), 1))
    AND NOT EXISTS (
      SELECT 1
      FROM public.activities a
      WHERE a.target_type = 'daily_task'
        AND a.target_id = dt.daily_task_id
    )
),
combined AS (
  SELECT * FROM activities_feed
  UNION ALL
  SELECT * FROM daily_tasks_feed
)
SELECT
  c.activity_id,
  c.action_type,
  c.target_type,
  c.event_type,
  c.event_time,
  c.user_id,
  c.user_name,
  c.user_photo,
  c.user_role,
  c.department_id,
  c.department_name,
  c.event_description,
  c.spent_hours,
  c.plan_id,
  c.plan_name,
  c.plan_date,
  c.quarterly_goal,
  c.quarter,
  c.process_name
FROM combined c
JOIN requester r ON TRUE
WHERE
  (r.role = 'employee' AND c.user_id = p_user_id)
  OR (r.role = 'head' AND c.department_id = r.department_id)
  OR (
    r.role NOT IN ('employee', 'head')
    AND (p_department_id IS NULL OR c.department_id = p_department_id)
  )
ORDER BY c.event_time DESC
LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_feed(uuid, uuid, integer, integer)
  TO authenticated, anon;
