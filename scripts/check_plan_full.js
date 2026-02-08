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

async function checkPlanWithTasks() {
    const planId = 'd22dd98d-2c78-4e7a-8439-67fd41dc08d8';

    console.log('📋 Проверка плана с задачами\n');
    console.log('='.repeat(80));

    // 1. Загружаем план
    const { data: plan } = await supabase
        .from('v_weekly_plans')
        .select('*')
        .eq('weekly_id', planId)
        .single();

    if (!plan) {
        console.log('❌ План не найден');
        return;
    }

    console.log('\n📌 ПЛАН:');
    console.log(`   ID: ${plan.weekly_id}`);
    console.log(`   Результат: ${plan.expected_result}`);
    console.log(`   Дата: ${plan.weekly_date}`);

    // 2. Загружаем назначенных сотрудников
    const { data: assigneeIds } = await supabase
        .from('weekly_plan_assignees')
        .select('user_id')
        .eq('weekly_plan_id', planId);

    console.log(`\n👥 НАЗНАЧЕННЫЕ СОТРУДНИКИ: ${assigneeIds?.length || 0}`);

    if (assigneeIds && assigneeIds.length > 0) {
        const { data: users } = await supabase
            .from('v_user_details')
            .select('user_id, full_name')
            .in('user_id', assigneeIds.map(a => a.user_id));

        users?.forEach((u, i) => {
            console.log(`   ${i + 1}. ${u.full_name} (${u.user_id})`);
        });
    }

    // 3. Загружаем задачи
    const { data: tasks } = await supabase
        .from('weekly_tasks')
        .select('*')
        .eq('weekly_plan_id', planId);

    console.log(`\n✅ ЗАДАЧИ: ${tasks?.length || 0}`);

    if (tasks && tasks.length > 0) {
        tasks.forEach((task, i) => {
            console.log(`\n   ${i + 1}. ${task.description}`);
            console.log(`      User ID: ${task.user_id}`);
            console.log(`      Часы: ${task.spent_hours}`);
            console.log(`      Выполнено: ${task.completed_at ? 'Да' : 'Нет'}`);
        });
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 ВЫВОД:');
    if (assigneeIds && assigneeIds.length > 0 && tasks && tasks.length > 0) {
        console.log('   ✅ План имеет назначенных сотрудников И задачи');
        console.log('   ✅ Задачи должны отображаться в UI');
    } else if (!assigneeIds || assigneeIds.length === 0) {
        console.log('   ❌ Нет назначенных сотрудников - задачи не будут показаны');
    } else if (!tasks || tasks.length === 0) {
        console.log('   ⚠️  Есть назначенные, но нет задач (это нормально)');
    }
}

checkPlanWithTasks();
