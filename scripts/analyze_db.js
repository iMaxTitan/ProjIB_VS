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
    envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function analyzeDB() {
    console.log('=== SUPABASE DATABASE ANALYSIS ===\n');

    // 1. Discovery
    const tables = [
        'user_profiles', 'annual_plans', 'quarterly_plans', 'weekly_plans',
        'weekly_tasks', 'departments', 'processes', 'companies',
        'kpi_metrics', 'kpi_values'
    ];

    console.log('--- Table & Policy Overview ---');
    for (const table of tables) {
        try {
            const { data: policies, error: polError } = await supabase
                .rpc('get_policies', { table_name: table })
                .catch(() => ({ data: null, error: { message: 'RPC get_policies missing' } }));

            const { data: rlsCheck, error: rlsError } = await supabase
                .rpc('check_rls_enabled', { table_name: table })
                .catch(() => ({ data: null, error: { message: 'RPC check_rls_enabled missing' } }));

            console.log(`Table: ${table.padEnd(20)}`);
            if (rlsError) {
                // Generic check via SELECT
                const { error: selectError } = await supabase.from(table).select('*').limit(0);
                if (selectError && selectError.code === '42501') {
                    console.log('   RLS: Likely ENABLED (Access Denied for Anon)');
                } else {
                    console.log('   RLS: Likely DISABLED or using Service Role');
                }
            } else {
                console.log(`   RLS: ${rlsCheck ? '✅ ENABLED' : '❌ DISABLED'}`);
            }
        } catch (e) {
            console.log(`   Error checking ${table}: ${e.message}`);
        }
    }

    // 2. Query Performance on Views
    console.log('\n--- View Performance (Top 5 Rows) ---');
    const views = ['v_annual_plans', 'v_quarterly_plans', 'v_weekly_plans', 'v_kpi_current'];
    for (const view of views) {
        try {
            const start = Date.now();
            const { data, error } = await supabase.from(view).select('*').limit(5);
            const duration = Date.now() - start;
            if (!error) {
                console.log(`View: ${view.padEnd(20)} | Time: ${duration}ms | Rows: ${data.length}`);
            } else {
                console.log(`View: ${view.padEnd(20)} | Error: ${error.message}`);
            }
        } catch (e) {
            console.log(`View: ${view.padEnd(20)} | Exception: ${e.message}`);
        }
    }

    // 3. Check for specific missing indexes (Common Join Keys)
    console.log('\n--- Join Key Analysis ---');
    const relations = [
        { table: 'quarterly_plans', column: 'annual_plan_id' },
        { table: 'weekly_plans', column: 'quarterly_id' },
        { table: 'weekly_tasks', column: 'weekly_plan_id' },
        { table: 'weekly_tasks', column: 'user_id' },
        { table: 'user_profiles', column: 'department_id' }
    ];

    for (const rel of relations) {
        // We can't easily check for index existence via JS without a custom RPC or direct SQL access
        // But we can check if querying by that column is fast
        const start = Date.now();
        const { error } = await supabase.from(rel.table).select(rel.column).limit(5);
        const duration = Date.now() - start;
        console.log(`Rel: ${rel.table}.${rel.column.padEnd(15)} | Scan Time: ${duration}ms`);
    }
}

analyzeDB();
