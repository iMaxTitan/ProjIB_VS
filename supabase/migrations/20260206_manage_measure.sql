-- Function: manage_measure
-- CRUD operations for measures table
-- Created: 2026-02-06

CREATE OR REPLACE FUNCTION public.manage_measure(
    p_action TEXT,
    p_measure_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_process_id UUID DEFAULT NULL,
    p_category TEXT DEFAULT 'operational',
    p_target_value NUMERIC DEFAULT 0,
    p_target_period TEXT DEFAULT 'month',
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_measure_id UUID;
    v_result JSONB;
BEGIN
    -- Validate action
    IF p_action NOT IN ('create', 'update', 'delete') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid action: ' || p_action);
    END IF;

    -- Validate category
    IF p_action IN ('create', 'update') AND p_category NOT IN ('strategic', 'process', 'operational') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid category: ' || p_category);
    END IF;

    -- Validate target_period
    IF p_action IN ('create', 'update') AND p_target_period NOT IN ('year', 'quarter', 'month') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid target_period: ' || p_target_period);
    END IF;

    CASE p_action
        WHEN 'create' THEN
            -- Validate required fields
            IF p_name IS NULL OR p_name = '' THEN
                RETURN jsonb_build_object('success', false, 'error', 'Name is required');
            END IF;

            INSERT INTO public.measures (
                name,
                description,
                process_id,
                category,
                target_value,
                target_period,
                is_active,
                created_at
            ) VALUES (
                p_name,
                p_description,
                p_process_id,
                p_category::text,
                COALESCE(p_target_value, 0),
                p_target_period,
                true,
                NOW()
            )
            RETURNING measure_id INTO v_measure_id;

            RETURN jsonb_build_object(
                'success', true,
                'measure_id', v_measure_id,
                'action', 'created'
            );

        WHEN 'update' THEN
            -- Validate measure_id
            IF p_measure_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'measure_id is required for update');
            END IF;

            -- Check if measure exists
            IF NOT EXISTS (SELECT 1 FROM public.measures WHERE measure_id = p_measure_id) THEN
                RETURN jsonb_build_object('success', false, 'error', 'Measure not found');
            END IF;

            UPDATE public.measures
            SET
                name = COALESCE(p_name, name),
                description = p_description,
                process_id = p_process_id,
                category = COALESCE(p_category, category),
                target_value = COALESCE(p_target_value, target_value),
                target_period = COALESCE(p_target_period, target_period),
                updated_at = NOW()
            WHERE measure_id = p_measure_id;

            RETURN jsonb_build_object(
                'success', true,
                'measure_id', p_measure_id,
                'action', 'updated'
            );

        WHEN 'delete' THEN
            -- Validate measure_id
            IF p_measure_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'measure_id is required for delete');
            END IF;

            -- Check if measure exists
            IF NOT EXISTS (SELECT 1 FROM public.measures WHERE measure_id = p_measure_id) THEN
                RETURN jsonb_build_object('success', false, 'error', 'Measure not found');
            END IF;

            -- Soft delete (set is_active = false) or hard delete
            -- Using soft delete to preserve data integrity
            UPDATE public.measures
            SET is_active = false, updated_at = NOW()
            WHERE measure_id = p_measure_id;

            RETURN jsonb_build_object(
                'success', true,
                'measure_id', p_measure_id,
                'action', 'deleted'
            );

    END CASE;

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.manage_measure TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_measure TO service_role;

COMMENT ON FUNCTION public.manage_measure IS 'CRUD operations for measures (KPI activities) table';
