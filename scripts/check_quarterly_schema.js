const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

async function main() {
  const { data, error } = await supabase
    .from('quarterly_plans')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Quarterly plans columns:');
  if (data && data[0]) {
    Object.keys(data[0]).forEach(col => {
      console.log(`  - ${col}`);
    });
  }
}

main();
