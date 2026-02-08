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

async function checkColumns() {
    console.log('--- Checking weekly_plans columns ---');
    // Selecting a non-existent column throws error usually
    const { data, error } = await supabase.from('weekly_plans').select('weekly_id, department_id').limit(1);
    if (error) {
        console.log('Error selecting department_id:', error.message);
    } else {
        console.log('department_id exists.');
    }
}

checkColumns();
