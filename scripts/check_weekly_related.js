const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

async function main() {
  // Check weekly_plan_assignees
  console.log('1. weekly_plan_assignees columns:');
  const { data: ass, error: assErr } = await supabase
    .from('weekly_plan_assignees')
    .select('*')
    .limit(1);

  if (assErr) {
    console.log('   Error:', assErr.message);
  } else if (ass && ass[0]) {
    Object.keys(ass[0]).forEach(col => console.log(`   - ${col}`));
  } else {
    console.log('   No data');
  }

  // Check weekly_tasks
  console.log('\n2. weekly_tasks columns:');
  const { data: tasks, error: taskErr } = await supabase
    .from('weekly_tasks')
    .select('*')
    .limit(1);

  if (taskErr) {
    console.log('   Error:', taskErr.message);
  } else if (tasks && tasks[0]) {
    Object.keys(tasks[0]).forEach(col => console.log(`   - ${col}`));
  }

  // Check if there are 2026 plans
  console.log('\n3. Weekly plans by year:');
  const { data: plans } = await supabase
    .from('weekly_plans')
    .select('weekly_date');

  const years = {};
  plans?.forEach(p => {
    const year = new Date(p.weekly_date).getFullYear();
    years[year] = (years[year] || 0) + 1;
  });
  Object.entries(years).forEach(([year, count]) => {
    console.log(`   ${year}: ${count} plans`);
  });
}

main();
