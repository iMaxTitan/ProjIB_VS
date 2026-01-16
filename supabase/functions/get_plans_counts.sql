-- Функция для получения количества планов по статусам для пользователя
CREATE OR REPLACE FUNCTION get_plans_counts(u_id UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    user_role TEXT;
    dep_id UUID;
    is_chief BOOLEAN;
BEGIN
    -- Получаем роль и отдел пользователя
    SELECT
        role,
        department_id
    INTO
        user_role,
        dep_id
    FROM
        user_profiles
    WHERE
        user_id = u_id;
    
    -- Определяем, является ли пользователь chief
    is_chief := (user_role = 'chief');
    
    WITH annual_counts AS (
        SELECT 
            status, 
            COUNT(*) as count 
        FROM 
            v_annual_plans 
        WHERE 
            is_chief OR user_id = u_id
        GROUP BY 
            status
    ),
    quarterly_counts AS (
        SELECT 
            status, 
            COUNT(*) as count 
        FROM 
            v_quarterly_plans 
        WHERE 
            is_chief OR department_id = dep_id
        GROUP BY 
            status
    ),
    weekly_counts AS (
        SELECT 
            status, 
            COUNT(*) as count 
        FROM 
            v_weekly_plans 
        WHERE 
            is_chief OR department_id = dep_id
        GROUP BY 
            status
    )
    SELECT jsonb_build_object(
        'annual', jsonb_build_object(
            'active', COALESCE((SELECT count FROM annual_counts WHERE status = 'active'), 0),
            'submitted', COALESCE((SELECT count FROM annual_counts WHERE status = 'submitted'), 0),
            'draft', COALESCE((SELECT count FROM annual_counts WHERE status = 'draft'), 0),
            'returned', COALESCE((SELECT count FROM annual_counts WHERE status = 'returned'), 0)
        ),
        'quarterly', jsonb_build_object(
            'active', COALESCE((SELECT count FROM quarterly_counts WHERE status = 'active'), 0),
            'submitted', COALESCE((SELECT count FROM quarterly_counts WHERE status = 'submitted'), 0),
            'draft', COALESCE((SELECT count FROM quarterly_counts WHERE status = 'draft'), 0),
            'returned', COALESCE((SELECT count FROM quarterly_counts WHERE status = 'returned'), 0)
        ),
        'weekly', jsonb_build_object(
            'active', COALESCE((SELECT count FROM weekly_counts WHERE status = 'active'), 0),
            'submitted', COALESCE((SELECT count FROM weekly_counts WHERE status = 'submitted'), 0),
            'draft', COALESCE((SELECT count FROM weekly_counts WHERE status = 'draft'), 0),
            'returned', COALESCE((SELECT count FROM weekly_counts WHERE status = 'returned'), 0)
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Предоставляем права на выполнение функции для аутентифицированных пользователей
GRANT EXECUTE ON FUNCTION get_plans_counts(UUID) TO authenticated;

-- Комментарий к функции
COMMENT ON FUNCTION get_plans_counts(UUID) IS 'Возвращает количество планов по типам и статусам для указанного пользователя с учетом его роли';
