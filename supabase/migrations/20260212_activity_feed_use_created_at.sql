-- Migration: v_activity_feed — event_time = created_at вместо task_date
-- Задачи добавленные сегодня в январский план должны показываться в ленте за сегодня

-- Пересоздаём view с единственным изменением:
--   было:  dt.task_date::timestamp with time zone + '12:00:00'::interval AS event_time
--   стало: dt.created_at AS event_time

DROP VIEW IF EXISTS public.v_activity_feed;

CREATE VIEW public.v_activity_feed AS
WITH activities_feed AS (
    SELECT a.activity_id,
        COALESCE(a.action_type, 'other'::text) AS action_type,
        COALESCE(a.target_type, ''::text) AS target_type,
        COALESCE(a.action_type, 'other'::text) AS event_type,
        a.created_at AS event_time,
        a.user_id,
        COALESCE(u.full_name, u.email, 'Неизвестно'::text) AS user_name,
        u.photo_base64 AS user_photo,
        u.role AS user_role,
        COALESCE(u.department_id, NULLIF(a.details ->> 'department_id'::text, ''::text)::uuid) AS department_id,
        COALESCE(u.department_name, d.department_name, a.details ->> 'department_name'::text, ''::text) AS department_name,
        COALESCE(a.details ->> 'description'::text, a.details ->> 'message'::text, a.details ->> 'goal'::text, a.details ->> 'expected_result'::text, concat(COALESCE(a.action_type, 'event'::text), ' ', COALESCE(a.target_type, ''::text))) AS event_description,
        NULLIF(a.details ->> 'spent_hours'::text, ''::text)::numeric AS spent_hours,
        COALESCE(a.target_id::text, ''::text) AS plan_id,
        COALESCE(a.details ->> 'plan_name'::text, a.details ->> 'goal'::text, ''::text) AS plan_name,
        COALESCE(a.details ->> 'plan_date'::text, a.created_at::text) AS plan_date,
        NULLIF(a.details ->> 'quarterly_goal'::text, ''::text) AS quarterly_goal,
        NULLIF(a.details ->> 'quarter'::text, ''::text)::integer AS quarter,
        NULLIF(a.details ->> 'process_name'::text, ''::text) AS process_name
    FROM activities a
        LEFT JOIN v_user_details u ON u.user_id = a.user_id
        LEFT JOIN departments d ON d.department_id = NULLIF(a.details ->> 'department_id'::text, ''::text)::uuid
), daily_tasks_feed AS (
    SELECT dt.daily_task_id AS activity_id,
        'create'::text AS action_type,
        'daily_task'::text AS target_type,
        'task_created'::text AS event_type,
        -- CHANGED: was dt.task_date::timestamp with time zone + '12:00:00'::interval
        dt.created_at AS event_time,
        dt.user_id,
        COALESCE(u.full_name, u.email, 'Неизвестно'::text) AS user_name,
        u.photo_base64 AS user_photo,
        u.role AS user_role,
        COALESCE(u.department_id, qp.department_id) AS department_id,
        COALESCE(u.department_name, dep.department_name, ''::text) AS department_name,
        COALESCE(dt.description, mp.description, ''::text) AS event_description,
        dt.spent_hours,
        dt.monthly_plan_id::text AS plan_id,
        COALESCE(mp.description, ''::text) AS plan_name,
        dt.task_date::text AS plan_date,
        qp.goal AS quarterly_goal,
        qp.quarter,
        pr.process_name
    FROM daily_tasks dt
        LEFT JOIN v_user_details u ON u.user_id = dt.user_id
        LEFT JOIN monthly_plans mp ON mp.monthly_plan_id = dt.monthly_plan_id
        LEFT JOIN quarterly_plans qp ON qp.quarterly_id = mp.quarterly_id
        LEFT JOIN departments dep ON dep.department_id = qp.department_id
        LEFT JOIN measures ms ON ms.measure_id = mp.measure_id
        LEFT JOIN processes pr ON pr.process_id = ms.process_id
    WHERE NOT (EXISTS (
        SELECT 1
        FROM activities a
        WHERE a.target_type = 'daily_task'::text AND a.target_id = dt.daily_task_id
    ))
)
SELECT * FROM activities_feed
UNION ALL
SELECT * FROM daily_tasks_feed;

-- Восстанавливаем настройки
ALTER VIEW public.v_activity_feed SET (security_invoker = on);
GRANT SELECT ON public.v_activity_feed TO authenticated;
