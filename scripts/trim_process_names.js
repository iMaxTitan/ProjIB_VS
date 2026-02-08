const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

async function main() {
  // Get all processes
  const { data: processes } = await supabase
    .from('processes')
    .select('process_id, process_name');

  console.log('Checking for trailing spaces...\n');

  for (const p of processes) {
    const trimmed = p.process_name.trim();
    if (trimmed !== p.process_name) {
      console.log(`Fixing: "${p.process_name}" → "${trimmed}"`);

      const { error } = await supabase
        .from('processes')
        .update({ process_name: trimmed })
        .eq('process_id', p.process_id);

      if (error) {
        console.error('Error:', error.message);
      } else {
        console.log('✓ Fixed\n');
      }
    }
  }

  console.log('Done!');
}

main();
