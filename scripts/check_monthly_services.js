const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
});

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Monthly plans (showing title for matching)
  const { data: monthlyPlans, error: mpError } = await supabase
    .from('monthly_plans')
    .select('monthly_plan_id, quarterly_id, title, year, month, service_id')
    .limit(30);

  if (mpError) {
    console.error('Error fetching monthly_plans:', mpError);
    return;
  }

  console.log('=== Monthly plans (showing title and service_id) ===');
  monthlyPlans.forEach(mp => {
    console.log(`ID: ${mp.monthly_plan_id.slice(0,8)}... | service_id: ${mp.service_id || 'NULL'} | title: ${(mp.title || '').slice(0, 60)}`);
  });

  // Services
  const { data: services, error: svcError } = await supabase
    .from('services')
    .select('service_id, process_id, name')
    .order('name');

  if (svcError) {
    console.error('Error fetching services:', svcError);
    return;
  }

  console.log('\n=== Services ===');
  services.forEach(s => {
    console.log(`${s.service_id.slice(0,8)}... | ${s.name.slice(0, 80)}`);
  });

  // Count
  console.log(`\nTotal monthly_plans: ${monthlyPlans.length}`);
  console.log(`Total services: ${services.length}`);
  console.log(`Monthly plans with NULL service_id: ${monthlyPlans.filter(m => !m.service_id).length}`);
}

check();
