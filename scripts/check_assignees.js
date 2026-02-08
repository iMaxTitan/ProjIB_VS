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
    envConfig.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkAssignees() {
    console.log('--- Checking Assignees Tables ---');

    // Try to find the correct table for assignees
    const tables = ['weekly_plan_assignees', 'weekly_plan_employees', 'weekly_plan_users', 'plan_assignees'];

    for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*').limit(1);
        if (!error) {
            console.log(`Found table: ${t}`);
            console.log('Sample:', data[0]);
            return;
        }
    }
    console.log('Could not guess assignees table.');
}

checkAssignees();
