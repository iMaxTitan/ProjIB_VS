const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

const supabase = createClient(
    envConfig.NEXT_PUBLIC_SUPABASE_URL,
    envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkTasks() {
    console.log('🔍 Проверка задач в недельных планах\n');

    // Берем первый недельный план
    const { data: weeklyPlan } = await supabase
        .from('v_weekly_plans')
        .select('weekly_id, expected_result')
        .limit(1)
        .single();

    if (!weeklyPlan) {
        console.log('❌ Нет недельных планов');
        return;
    }

    console.log(`План: ${weeklyPlan.expected_result}`);
    console.log(`ID: ${weeklyPlan.weekly_id}\n`);

    // Проверяем задачи
    const { data: tasks, error } = await supabase
        .from('weekly_tasks')
        .select('*')
        .eq('weekly_plan_id', weeklyPlan.weekly_id);

    if (error) {
        console.log('❌ Ошибка загрузки задач:', error.message);
        return;
    }

    console.log(`Найдено задач: ${tasks?.length || 0}`);

    if (tasks && tasks.length > 0) {
        tasks.forEach((task, i) => {
            console.log(`\n${i + 1}. ${task.task_content || task.description || 'без описания'}`);
            console.log(`   Пользователь: ${task.user_id}`);
            console.log(`   Выполнено: ${task.completed_at ? 'Да' : 'Нет'}`);
        });
    } else {
        console.log('\n⚠️  Задачи не найдены.');
        console.log('Возможно, таблица weekly_tasks пустая или нет связи с weekly_plan_id');
    }
}

checkTasks();
