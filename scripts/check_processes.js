const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

async function main() {
  const { data, error } = await supabase
    .from('processes')
    .select(`
      process_id,
      process_name,
      department_id,
      departments (
        department_name
      )
    `)
    .order('process_name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Processes with departments:\n');
  data.forEach(p => {
    const dept = p.departments?.department_name || 'НЕ ПРИЗНАЧЕНО';
    console.log(`${dept.padEnd(10)} | ${p.process_name}`);
  });

  // Check for unassigned
  const unassigned = data.filter(p => !p.department_id);
  if (unassigned.length > 0) {
    console.log('\n⚠️ Без відділу:');
    unassigned.forEach(p => console.log(`  - ${p.process_name}`));
  }
}

main();
