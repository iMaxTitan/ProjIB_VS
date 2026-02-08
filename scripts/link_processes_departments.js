const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('1. Adding department_id column to processes...');

  // Check if column exists first
  const { data: cols } = await supabase.rpc('get_column_exists', {
    table_name: 'processes',
    column_name: 'department_id'
  }).maybeSingle();

  // Add column via raw SQL
  const { error: alterError } = await supabase.rpc('exec_sql', {
    sql: 'ALTER TABLE processes ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(department_id);'
  });

  if (alterError) {
    console.log('Note: Column may already exist or need manual creation via Supabase dashboard');
    console.log('Error:', alterError.message);
  }

  // Update ОКБ processes
  console.log('\n2. Linking ОКБ processes...');
  const okbProcesses = [
    'Управління правами доступу',
    'Управління безпекою інформаційних систем',
    'Управління безпекою обчислювальних систем',
    'Управління безпекою мережі',
    'Моніторинг та реагування на події та інциденти ІБ'
  ];

  const { error: okbError, count: okbCount } = await supabase
    .from('processes')
    .update({ department_id: '36dab3d8-2c16-4c1c-ae8c-b62367482a7e' })
    .in('process_name', okbProcesses);

  if (okbError) console.log('ОКБ Error:', okbError.message);
  else console.log('ОКБ: Updated');

  // Update СВК processes
  console.log('\n3. Linking СВК processes...');
  const svkProcesses = [
    'Захист даних',
    'Управлінська та організаційна діяльність'
  ];

  const { error: svkError } = await supabase
    .from('processes')
    .update({ department_id: '9beab000-39d0-4d7a-952d-242cef86d0f0' })
    .in('process_name', svkProcesses);

  if (svkError) console.log('СВК Error:', svkError.message);
  else console.log('СВК: Updated');

  // Update СМУР processes
  console.log('\n4. Linking СМУР processes...');
  const smurProcesses = [
    'Управління ризиками інформаційної безпеки',
    'Навчання та підвищення обізнаності у сфері ІБ',
    'Управління документацією СУІБ',
    'Безперервність інформаційної безпеки'
  ];

  const { error: smurError } = await supabase
    .from('processes')
    .update({ department_id: '62f49b72-e9b2-481a-af87-3d459a8eba28' })
    .in('process_name', smurProcesses);

  if (smurError) console.log('СМУР Error:', smurError.message);
  else console.log('СМУР: Updated');

  // Verify results
  console.log('\n5. Verifying...');
  const { data: result } = await supabase
    .from('processes')
    .select('process_name, department_id')
    .order('process_name');

  console.log('\nResults:');
  result.forEach(p => {
    const dept = p.department_id ? '✓' : '✗';
    console.log(`${dept} ${p.process_name}`);
  });
}

main().catch(console.error);
