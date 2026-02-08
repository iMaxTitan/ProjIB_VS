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

async function findTasksData() {
    console.log('🔍 Поиск данных задач\n');

    // Проверяем есть ли вообще записи в weekly_tasks
    const { data: allTasks, error: tasksError } = await supabase
        .from('weekly_tasks')
        .select('weekly_plan_id, description')
        .limit(5);

    if (tasksError) {
        console.log('❌ Ошибка доступа к weekly_tasks:', tasksError.message);
        console.log('Возможно таблица не существует или нет прав доступа');
        return;
    }

    console.log(`Всего записей в weekly_tasks (первые 5): ${allTasks?.length || 0}\n`);

    if (!allTasks || allTasks.length === 0) {
        console.log('⚠️  Таблица weekly_tasks пустая!');
        console.log('Задачи нужно создавать через отдельный интерфейс.');
        return;
    }

    // Показываем примеры
    allTasks.forEach((task, i) => {
        console.log(`${i + 1}. Plan ID: ${task.weekly_plan_id}`);
        console.log(`   Описание: ${task.description || 'нет'}\n`);
    });

    // Проверяем есть ли задачи для существующих планов
    const uniquePlanIds = [...new Set(allTasks.map(t => t.weekly_plan_id))];
    console.log(`Уникальных weekly_plan_id с задачами: ${uniquePlanIds.length}`);
}

findTasksData();
