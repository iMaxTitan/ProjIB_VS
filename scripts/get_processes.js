const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

async function main() {
  const { data, error } = await supabase
    .from('processes')
    .select('*')
    .order('process_name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Processes:');
  data.forEach((p, i) => {
    console.log(`${i + 1}. ${p.process_name} (ID: ${p.process_id})`);
  });
}

main();
