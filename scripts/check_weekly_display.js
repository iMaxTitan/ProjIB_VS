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

async function checkWeeklyPlansDisplay() {
    console.log('🔍 Проверка отображения недельных планов\n');

    // 1. Берем 2026 год
    const year = 2026;
    console.log(`Выбранный год: ${year}`);

    // 2. Загружаем годовые планы 2026
    const { data: annualPlans } = await supabase
        .from('v_annual_plans')
        .select('annual_id, year, goal')
        .eq('year', year);

    console.log(`Годовых планов ${year}: ${annualPlans?.length || 0}\n`);

    if (!annualPlans || annualPlans.length === 0) return;

    const annualIds = annualPlans.map(a => a.annual_id);

    // 3. Загружаем квартальные планы для этих годовых
    const { data: quarterlyPlans } = await supabase
        .from('v_quarterly_plans')
        .select('quarterly_id, quarter, goal, department_id')
        .in('annual_plan_id', annualIds);

    console.log(`Квартальных планов: ${quarterlyPlans?.length || 0}\n`);

    if (!quarterlyPlans || quarterlyPlans.length === 0) return;

    // 4. Загружаем недельные планы для Q1
    const q1Ids = quarterlyPlans.filter(q => q.quarter === 1).map(q => q.quarterly_id);

    console.log(`Квартальных планов Q1: ${q1Ids.length}`);

    const { data: weeklyPlans } = await supabase
        .from('v_weekly_plans')
        .select('weekly_id, expected_result, department_id, weekly_date')
        .in('quarterly_id', q1Ids)
        .order('weekly_date', { ascending: true });

    console.log(`Недельных планов Q1: ${weeklyPlans?.length || 0}\n`);

    if (weeklyPlans && weeklyPlans.length > 0) {
        console.log('Примеры недельных планов:');
        weeklyPlans.slice(0, 5).forEach((p, i) => {
            console.log(`  ${i + 1}. ${p.expected_result.substring(0, 60)}...`);
            console.log(`     Дата: ${p.weekly_date}, Отдел: ${p.department_id}\n`);
        });
    }

    console.log('\n💡 ВЫВОД:');
    if (weeklyPlans && weeklyPlans.length > 0) {
        console.log('   ✅ Недельные планы ЕСТЬ в базе');
        console.log('   ➡️  Если не показываются в UI - проверь фильтрацию по ролям/отделу');
    } else {
        console.log('   ❌ Недельных планов НЕТ для Q1 2026');
    }
}

checkWeeklyPlansDisplay();
