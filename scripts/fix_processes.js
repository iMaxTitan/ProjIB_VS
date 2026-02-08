const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

async function main() {
  // Fix processes with trailing spaces - assign to ОКБ
  const okbId = '36dab3d8-2c16-4c1c-ae8c-b62367482a7e';

  console.log('Fixing: Управління безпекою мережі...');
  const { error: err1 } = await supabase
    .from('processes')
    .update({ department_id: okbId })
    .like('process_name', 'Управління безпекою мережі%');

  if (err1) console.error('Error 1:', err1.message);
  else console.log('✓ Done');

  console.log('Fixing: Управління безпекою обчислювальних систем...');
  const { error: err2 } = await supabase
    .from('processes')
    .update({ department_id: okbId })
    .like('process_name', 'Управління безпекою обчислювальних систем%');

  if (err2) console.error('Error 2:', err2.message);
  else console.log('✓ Done');

  // Verify
  console.log('\nVerifying...');
  const { data } = await supabase
    .from('processes')
    .select('process_name, department_id')
    .is('department_id', null);

  if (data && data.length > 0) {
    console.log('Still unassigned:', data);
  } else {
    console.log('✓ All processes have departments!');
  }
}

main();
