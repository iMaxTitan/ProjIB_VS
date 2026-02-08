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

async function showAIContext() {
    console.log('📊 ПРИМЕР ДАННЫХ ДЛЯ ИИ-ПОМОЩНИКА\n');
    console.log('='.repeat(80));

    // Берем первый квартальный план для примера
    const { data: qPlans } = await supabase
        .from('v_quarterly_plans')
        .select('*')
        .limit(1)
        .single();

    if (!qPlans) {
        console.log('❌ Нет квартальных планов в базе');
        return;
    }

    console.log('\n1️⃣ КВАРТАЛЬНЫЙ ПЛАН (контекст):');
    console.log('-'.repeat(80));
    console.log(`   Квартал: Q${qPlans.quarter}`);
    console.log(`   Цель: ${qPlans.goal}`);
    console.log(`   Ожидаемый результат: ${qPlans.expected_result}`);
    console.log(`   Отдел ID: ${qPlans.department_id}`);
    console.log(`   Процесс ID: ${qPlans.process_id || 'нет'}`);

    // Загружаем недельные планы по той же логике что и в коде
    let query = supabase
        .from('v_weekly_plans')
        .select('expected_result, weekly_date, department_id, process_id')
        .eq('quarterly_id', qPlans.quarterly_id)
        .order('weekly_date', { ascending: false })
        .limit(100);

    if (qPlans.department_id) {
        query = query.eq('department_id', qPlans.department_id);
    }

    if (qPlans.process_id) {
        query = query.eq('process_id', qPlans.process_id);
    }

    const { data: weeklyPlans } = await query;

    console.log('\n2️⃣ СУЩЕСТВУЮЩИЕ НЕДЕЛЬНЫЕ ПЛАНЫ (последние 100 с фильтрацией):');
    console.log('-'.repeat(80));
    console.log(`   Найдено записей: ${weeklyPlans?.length || 0}\n`);

    if (weeklyPlans && weeklyPlans.length > 0) {
        const formatted = weeklyPlans
            .filter(p => p.expected_result)
            .slice(0, 10)  // Показываем только первые 10 для примера
            .map(p => {
                const date = new Date(p.weekly_date).toLocaleDateString('ru-RU');
                return `   [${date}] ${p.expected_result}`;
            });

        formatted.forEach(line => console.log(line));

        if (weeklyPlans.length > 10) {
            console.log(`\n   ... и еще ${weeklyPlans.length - 10} записей`);
        }
    } else {
        console.log('   (нет записей)');
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 ИТОГО для ИИ:');
    console.log(`   - Цель квартала: "${qPlans.goal}"`);
    console.log(`   - Ожидаемый результат квартала: "${qPlans.expected_result}"`);
    console.log(`   - История: ${weeklyPlans?.length || 0} недельных планов с датами`);
    console.log(`   - Фильтры: отдел=${qPlans.department_id}, процесс=${qPlans.process_id || 'любой'}`);
    console.log('\nНа основе этих данных ИИ генерирует предложение для нового недельного плана.\n');
}

showAIContext();
