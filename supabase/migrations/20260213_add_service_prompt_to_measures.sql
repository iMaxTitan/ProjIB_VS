-- Add service_prompt column to measures
ALTER TABLE measures ADD COLUMN IF NOT EXISTS service_prompt text;

-- Drop ALL existing overloads of manage_measure
DROP FUNCTION IF EXISTS public.manage_measure(text, uuid, text, text, uuid, text, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.manage_measure(text, uuid, text, text, text, uuid, text, integer, text, uuid);

-- Recreate manage_measure with service_prompt support
CREATE OR REPLACE FUNCTION public.manage_measure(
    p_action text,
    p_measure_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_service_name text DEFAULT NULL,
    p_service_prompt text DEFAULT NULL,
    p_process_id uuid DEFAULT NULL,
    p_category text DEFAULT 'operational',
    p_target_value integer DEFAULT 0,
    p_target_period text DEFAULT 'year',
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_measure_id uuid;
BEGIN
    IF p_action = 'create' THEN
        INSERT INTO measures (name, description, service_name, service_prompt, process_id, category, target_value, target_period, created_by)
        VALUES (p_name, p_description, p_service_name, p_service_prompt, p_process_id, p_category, p_target_value, p_target_period, p_user_id)
        RETURNING measure_id INTO v_measure_id;

        RETURN jsonb_build_object('success', true, 'measure_id', v_measure_id);

    ELSIF p_action = 'update' THEN
        UPDATE measures SET
            name = COALESCE(p_name, name),
            description = p_description,
            service_name = p_service_name,
            service_prompt = p_service_prompt,
            process_id = p_process_id,
            category = COALESCE(p_category, category),
            target_value = COALESCE(p_target_value, target_value),
            target_period = COALESCE(p_target_period, target_period)
        WHERE measure_id = p_measure_id;

        RETURN jsonb_build_object('success', true, 'measure_id', p_measure_id);

    ELSIF p_action = 'delete' THEN
        DELETE FROM measures WHERE measure_id = p_measure_id;
        RETURN jsonb_build_object('success', true);

    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Unknown action: ' || p_action);
    END IF;
END;
$$;

-- Restore permissions
GRANT EXECUTE ON FUNCTION public.manage_measure(text, uuid, text, text, text, text, uuid, text, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_measure(text, uuid, text, text, text, text, uuid, text, integer, text, uuid) TO service_role;

-- Add service_prompt to v_kpi_operational (new column at the end)
-- security_invoker = true preserves RLS enforcement (set by 20260212_fix_security_invoker_views.sql)
CREATE OR REPLACE VIEW v_kpi_operational
WITH (security_invoker = true) AS
SELECT m.measure_id AS entity_id,
    m.name AS entity_name,
    m.description,
    m.process_id,
    p.process_name,
    m.category,
    m.target_value,
    m.target_period,
    'measure'::text AS entity_type,
    count(DISTINCT mp.monthly_plan_id) AS plans_count,
    count(dt.daily_task_id) AS actual_value,
    COALESCE(sum(dt.spent_hours), 0::numeric) AS total_hours,
    EXTRACT(year FROM CURRENT_DATE)::integer AS period_year,
    m.service_name,
    m.service_prompt
FROM measures m
    LEFT JOIN processes p ON m.process_id = p.process_id
    LEFT JOIN monthly_plans mp ON mp.measure_id = m.measure_id
    LEFT JOIN daily_tasks dt ON dt.monthly_plan_id = mp.monthly_plan_id
WHERE m.is_active = true
GROUP BY m.measure_id, m.name, m.description, m.process_id, p.process_name, m.category, m.target_value, m.target_period, m.service_name, m.service_prompt;
