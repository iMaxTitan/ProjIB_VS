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
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixRpcTask() {
    console.log('🔧 Исправление функции manage_weekly_task...');

    const sqlPath = path.resolve(__dirname, '../C:/Users/i_max/.gemini/antigravity/brain/f40de4f9-3163-4a5b-8c9d-a8656cdf5f49/create_manage_weekly_task.sql');

    // Fallback: Read from the artifact location I know
    let sqlScript = '';
    try {
        // Since I wrote it to the artifacts dir, I should read it from there.
        // Or I can just inline it here to be safe and avoid path issues.
        // Let's inline it for robustness.
        sqlScript = `
-- Drop any existing overloads of manage_weekly_task to fix ambiguity
DROP FUNCTION IF EXISTS public.manage_weekly_task(uuid, uuid, uuid, text, numeric, date, text);
DROP FUNCTION IF EXISTS public.manage_weekly_task(uuid, uuid, uuid, text, numeric, timestamp without time zone, text);
DROP FUNCTION IF EXISTS public.manage_weekly_task(uuid, uuid, uuid, text, numeric, timestamp with time zone, text);

-- Create a single unified function
CREATE OR REPLACE FUNCTION public.manage_weekly_task(
    _weekly_tasks_id uuid,
    _weekly_plan_id uuid,
    _user_id uuid,
    _description text,
    _spent_hours numeric,
    _completed_at date,
    _attachment_url text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task_id uuid;
BEGIN
    -- Если ID не передан, это создание новой задачи
    IF _weekly_tasks_id IS NULL THEN
        INSERT INTO weekly_tasks (
            weekly_plan_id,
            user_id,
            description,
            spent_hours,
            completed_at,
            attachment_url
        ) VALUES (
            _weekly_plan_id,
            _user_id,
            _description,
            _spent_hours,
            _completed_at,  -- PostgreSQL автоматически приведет date к timestamp если нужно
            _attachment_url
        ) RETURNING weekly_tasks_id INTO v_task_id;
    ELSE
        -- Обновление существующей задачи
        UPDATE weekly_tasks
        SET
            description = _description,
            spent_hours = _spent_hours,
            completed_at = _completed_at,
            attachment_url = _attachment_url,
            updated_at = now()
        WHERE weekly_tasks_id = _weekly_tasks_id
        RETURNING weekly_tasks_id INTO v_task_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'weekly_tasks_id', v_task_id);
END;
$$;
`;
    } catch (e) {
        console.error('Error reading SQL:', e);
    }

    // Try to execute using rpc 'exec_sql' if available (often used in internal tools)
    // If not available, we can't do much from here without raw access.
    // However, I suspect the user DOES NOT have exec_sql exposed.
    // The previous script check_rpc_function.js suggested copying to dashboard.

    // But wait, the user SAID "continue" which implies they want ME to fix it.
    // I will try to use the 'pg' library if available? No, I don't see it in package.json (I haven't checked).
    // I'll assume standard Supabase.

    // Let's try to see if there is any helper in the project.
    // Project has 'src/lib/supabase.ts'.

    // If I can't execute it, I will output the SQL to the user in the notify_user message.

    // I'll try to run a dummy query to see if connection works.
    const { data: testData, error: testError } = await supabase.from('weekly_tasks').select('count').limit(1);

    if (testError) {
        console.error("Connection failed:", testError.message);
        return;
    }

    console.log("Connection successful. Attempting to execute SQL via 'exec_sql' RPC...");

    const { data, error } = await supabase.rpc('exec_sql', { sql: sqlScript });

    if (error) {
        console.log('⚠️ Automatic execution failed (exec_sql RPC not found or constrained).');
        console.log('Please execute the following SQL manually in Supabase Dashboard:');
        console.log(sqlScript);
    } else {
        console.log('✅ SQL executed successfully!');
    }
}

fixRpcTask();
