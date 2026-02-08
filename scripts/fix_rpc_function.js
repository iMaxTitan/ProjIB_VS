const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Parse .env.local
const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = {};

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            envConfig[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
        }
    });
}

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Ошибка: Не найден SUPABASE_SERVICE_ROLE_KEY в .env.local');
    console.error('Необходим ключ service_role для выполнения SQL.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixRpcFunction() {
    console.log('🔧 Исправление функции manage_weekly_plan...');

    const sqlScript = `
-- Удаляем все существующие версии функции
DROP FUNCTION IF EXISTS public.manage_weekly_plan(uuid, uuid, uuid, date, text, numeric, text, uuid, uuid[], text, text, date);
DROP FUNCTION IF EXISTS public.manage_weekly_plan(uuid, uuid, uuid, date, text, numeric, public.plan_status, uuid, uuid[], text, text, date);

-- Создаём единую функцию
CREATE OR REPLACE FUNCTION public.manage_weekly_plan(
    p_weekly_id uuid,
    p_quarterly_id uuid,
    p_department_id uuid,
    p_weekly_date date,
    p_expected_result text,
    p_planned_hours numeric,
    p_status text,
    p_user_id uuid,
    p_assignees uuid[],
    p_action text,
    p_plan_type text,
    p_end_date date
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_weekly_id uuid := p_weekly_id;
BEGIN
    IF p_action = 'create' OR v_weekly_id IS NULL THEN
        INSERT INTO weekly_plans (
            quarterly_id,
            weekly_date,
            expected_result,
            planned_hours,
            status,
            created_by,
            plan_type,
            end_date
        ) VALUES (
            p_quarterly_id,
            p_weekly_date,
            p_expected_result,
            COALESCE(p_planned_hours, 0),
            p_status::plan_status,
            p_user_id,
            COALESCE(p_plan_type, 'weekly'),
            p_end_date
        ) RETURNING weekly_id INTO v_weekly_id;
    ELSE
        UPDATE weekly_plans
        SET quarterly_id = p_quarterly_id,
            weekly_date = p_weekly_date,
            expected_result = p_expected_result,
            planned_hours = COALESCE(p_planned_hours, 0),
            status = p_status::plan_status,
            plan_type = COALESCE(p_plan_type, 'weekly'),
            end_date = p_end_date
        WHERE weekly_id = v_weekly_id;
    END IF;

    -- Управление исполнителями
    DELETE FROM weekly_plan_assignees WHERE weekly_plan_id = v_weekly_id;
    IF p_assignees IS NOT NULL AND array_length(p_assignees, 1) > 0 THEN
        INSERT INTO weekly_plan_assignees (weekly_plan_id, user_id)
        SELECT v_weekly_id, unnest(p_assignees);
    END IF;

    RETURN jsonb_build_object('weekly_id', v_weekly_id);
END;
$$;
`;

    const { data, error } = await supabase.rpc('exec_sql', { sql: sqlScript });

    if (error) {
        // Если exec_sql не существует, пробуем через альтернативные методы
        console.log('⚠️ Не удалось выполнить через rpc. Скопируй и выполни этот SQL вручную в Supabase Dashboard > SQL Editor:');
        console.log('');
        console.log(sqlScript);
        console.log('');
        console.log('Ошибка:', error.message);
        process.exit(1);
    }

    console.log('✅ Функция успешно исправлена!');
    console.log('Теперь можно сохранять недельные планы без ошибок.');
}

fixRpcFunction().catch(err => {
    console.error('Ошибка:', err.message);
    process.exit(1);
});
