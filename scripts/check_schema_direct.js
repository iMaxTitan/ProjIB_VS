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

async function checkSchema() {
    console.log('--- DATABASE SCHEMA ---');

    const views = [
        'v_annual_plans',
        'v_quarterly_plans',
        'v_weekly_plans',
        'v_user_details',
        'v_active_weekly_plans',
        'v_kpi_current'
    ];

    for (const viewName of views) {
        try {
            const { data, error } = await supabase.from(viewName).select('*').limit(1);
            if (error) {
                console.log(`❌ View ${viewName}: ${error.message}`);
            } else {
                console.log(`✅ View ${viewName}: Found (${data.length} records sample)`);
                if (data.length > 0) {
                    console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`);
                }
            }
        } catch (e) {
            console.log(`❌ View ${viewName}: ${e.message}`);
        }
    }

    const tables = [
        'user_profiles',
        'annual_plans',
        'quarterly_plans',
        'weekly_plans',
        'weekly_tasks',
        'departments',
        'processes',
        'companies',
        'kpi_metrics',
        'kpi_values'
    ];

    for (const tableName of tables) {
        try {
            const { data, error } = await supabase.from(tableName).select('*').limit(1);
            if (error) {
                console.log(`❌ Table ${tableName}: ${error.message}`);
            } else {
                console.log(`✅ Table ${tableName}: Found (${data.length} records sample)`);
                if (data.length > 0) {
                    console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`);
                }
            }
        } catch (e) {
            console.log(`❌ Table ${tableName}: ${e.message}`);
        }
    }
}

checkSchema().catch(console.error);
