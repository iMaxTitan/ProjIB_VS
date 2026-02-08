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

async function testRpc() {
    console.log('🧪 Тестирование функции manage_weekly_plan...');
    console.log('');

    // Получим реальный quarterly_id из базы для теста
    const { data: qPlans } = await supabase
        .from('v_quarterly_plans')
        .select('quarterly_id')
        .limit(1);

    if (!qPlans || qPlans.length === 0) {
        console.log('❌ Не найдены квартальные планы для теста');
        return;
    }

    const testQuarterlyId = qPlans[0].quarterly_id;

    // Пробуем вызвать RPC с корректными параметрами
    const { data, error } = await supabase.rpc('manage_weekly_plan', {
        p_weekly_id: null,
        p_quarterly_id: testQuarterlyId,
        p_department_id: null,
        p_weekly_date: '2026-01-20',
        p_expected_result: 'ТЕСТ - проверка функции',
        p_planned_hours: 1,
        p_status: 'draft',
        p_user_id: 'ba856d59-1b30-4bcb-8dcd-6821b97b0f1e', // Используем существующий user_id
        p_assignees: [],
        p_action: 'create',
        p_plan_type: 'weekly',
        p_end_date: null,
    });

    if (error) {
        console.log('❌ ОШИБКА при вызове RPC:');
        console.log(error);
        console.log('');
        console.log('Функция все еще имеет проблему с перегрузкой.');
        return;
    }

    console.log('✅ SUCCESS! Функция работает корректно!');
    console.log('Результат:', data);
    console.log('');

    // Удаляем тестовую запись
    if (data && data.weekly_id) {
        await supabase.from('weekly_plans').delete().eq('weekly_id', data.weekly_id);
        console.log('🗑️  Тестовая запись удалена');
    }

    console.log('');
    console.log('🎉 Редактирование недельных планов теперь должно работать без ошибок!');
}

testRpc();
