const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

async function main() {
  const { data, error } = await supabase
    .from('departments')
    .select('*');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Departments:');
  console.log(JSON.stringify(data, null, 2));
}

main();
