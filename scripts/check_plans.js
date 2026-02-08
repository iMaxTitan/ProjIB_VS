const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.resolve(__dirname, '../.env.local');
const envConfig = {};

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            envConfig[key] = value;
        }
    });
}

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase credentials not found in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPlans() {
    console.log('--- Checking DB Content for 2026 ---');

    // 1. Get Annual Plans for 2026
    const { data: annuals, error: annualError } = await supabase
        .from('v_annual_plans')
        .select('annual_id, year, goal')
        .eq('year', 2026);

    if (annualError) {
        console.error('Error fetching annual plans:', annualError);
        return;
    }

    console.log(`Found ${annuals.length} annual plans for 2026.`);

    if (annuals.length === 0) return;

    const annualIds = annuals.map(a => a.annual_id);

    // 2. Get Quarterly Plans for these annual plans
    const { data: quarterly, error: quarterlyError } = await supabase
        .from('v_quarterly_plans')
        .select('quarterly_id, quarter, goal, annual_plan_id, status')
        .in('annual_plan_id', annualIds);

    if (quarterlyError) {
        console.error('Error fetching quarterly plans:', quarterlyError);
        return;
    }

    console.log(`Total Quarterly Plans found: ${quarterly.length}`);
    console.log('Quarterly Plans per Quarter:');
    const counts = {};
    quarterly.forEach(q => {
        const k = `Q${q.quarter}`;
        counts[k] = (counts[k] || 0) + 1;
    });
    console.log(counts);
}

checkPlans();
