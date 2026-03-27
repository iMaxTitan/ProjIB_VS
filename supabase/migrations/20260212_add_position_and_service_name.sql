-- ============================================================
-- Migration: Add position to user_profiles, service_name to measures
-- ============================================================

-- 1. ALTER TABLES
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS position text;
ALTER TABLE measures ADD COLUMN IF NOT EXISTS service_name text;

-- 2. Recreate v_user_details (add position)
CREATE OR REPLACE VIEW v_user_details AS
SELECT
    up.user_id,
    up.email,
    up.full_name,
    up.photo_base64,
    up.role,
    up.department_id,
    d.department_name,
    d.department_code,
    up.status,
    up.last_seen_at,
    up.position
FROM user_profiles up
LEFT JOIN departments d ON up.department_id = d.department_id;

-- 3. v_kpi_operational — add service_name (column 14, at end)
CREATE OR REPLACE VIEW v_kpi_operational AS
SELECT
    m.measure_id AS entity_id,
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
    m.service_name
FROM measures m
LEFT JOIN processes p ON m.process_id = p.process_id
LEFT JOIN monthly_plans mp ON mp.measure_id = m.measure_id
LEFT JOIN daily_tasks dt ON dt.monthly_plan_id = mp.monthly_plan_id
WHERE m.is_active = true
GROUP BY m.measure_id, m.name, m.description, m.process_id, p.process_name,
         m.category, m.target_value, m.target_period, m.service_name;

-- 4. Update upsert_user_profile — add p_position parameter
-- ВНИМАНИЕ: проверь текущее тело функции через:
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'upsert_user_profile';
CREATE OR REPLACE FUNCTION upsert_user_profile(
    p_email varchar,
    p_full_name varchar,
    p_department_id uuid,
    p_photo_base64 text DEFAULT NULL,
    p_role text DEFAULT 'employee',
    p_status text DEFAULT 'active',
    p_position text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_result jsonb;
BEGIN
    SELECT user_id INTO v_user_id FROM user_profiles WHERE email = p_email;

    IF v_user_id IS NULL THEN
        INSERT INTO user_profiles (email, full_name, department_id, photo_base64, role, status, position)
        VALUES (p_email, p_full_name, p_department_id, p_photo_base64, p_role, p_status, p_position)
        RETURNING user_id INTO v_user_id;
    ELSE
        UPDATE user_profiles SET
            full_name = p_full_name,
            department_id = p_department_id,
            photo_base64 = COALESCE(p_photo_base64, photo_base64),
            role = p_role,
            status = p_status,
            position = p_position,
            updated_at = now()
        WHERE user_id = v_user_id;
    END IF;

    SELECT row_to_json(v.*) INTO v_result
    FROM v_user_details v
    WHERE v.user_id = v_user_id;

    RETURN v_result;
END;
$$;

-- 5. Update manage_measure — add p_service_name parameter
-- ВНИМАНИЕ: проверь текущее тело функции через:
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'manage_measure';
CREATE OR REPLACE FUNCTION manage_measure(
    p_action text,
    p_measure_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_service_name text DEFAULT NULL,
    p_process_id uuid DEFAULT NULL,
    p_category text DEFAULT 'operational',
    p_target_value int DEFAULT 0,
    p_target_period text DEFAULT 'year',
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_measure_id uuid;
    v_result jsonb;
BEGIN
    IF p_action = 'create' THEN
        INSERT INTO measures (name, description, service_name, process_id, category, target_value, target_period, created_by)
        VALUES (p_name, p_description, p_service_name, p_process_id, p_category, p_target_value, p_target_period, p_user_id)
        RETURNING measure_id INTO v_measure_id;

        RETURN jsonb_build_object('success', true, 'measure_id', v_measure_id);

    ELSIF p_action = 'update' THEN
        UPDATE measures SET
            name = COALESCE(p_name, name),
            description = p_description,
            service_name = p_service_name,
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
