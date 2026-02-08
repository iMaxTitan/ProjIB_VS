const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkFunctions() {
  console.log('Testing manage_measure parameter combinations...\n');

  const tests = [
    { p_action: 'create' },
    { p_action: 'create', p_name: 'Test' },
    { p_action: 'create', p_name: 'Test', p_measure_id: null },
    { p_action: 'create', p_name: 'Test', p_category: 'operational' },
    { p_action: 'create', p_name: 'Test', p_target_value: 10 },
  ];

  for (const params of tests) {
    const { data, error } = await supabase.rpc('manage_measure', params);
    const status = error ?
      (error.message.includes('Could not find') ? 'NOT FOUND' : 'ERROR: ' + error.message.slice(0, 60))
      : 'OK: ' + JSON.stringify(data);
    console.log(Object.keys(params).join(', ') + ':', status);
  }
}

checkFunctions().catch(console.error);
