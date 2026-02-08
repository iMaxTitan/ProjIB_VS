const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

// Process name mapping (CSV name → DB name)
const processNameMap = {
  'Управління безпекою інформаційних систем': 'Управління безпекою інформаційних систем',
  'Управління безпекою обчислювальних систем': 'Управління безпекою обчислювальних систем',
  'Моніторинг та реагування на події та інциденти ІБ': 'Моніторинг та реагування на події та інциденти ІБ',
  'Управління правами доступу': 'Управління правами доступу',
  'Управлінська та організаційна діяльність': 'Управлінська та організаційна діяльність',
  'Захист даних': 'Захист даних',
  'Управління ризиками ІБ': 'Управління ризиками інформаційної безпеки',
  'Навчання та підвищення обізнаності у сфері ІБ': 'Навчання та підвищення обізнаності у сфері ІБ',
  'Управління документацією СУІБ': 'Управління документацією СУІБ',
  'Управління безперервністю ІБ': 'Безперервність інформаційної безпеки',
  'Управління безпекою мережі': 'Управління безпекою мережі'
};

async function main() {
  // 1. Get all processes
  console.log('1. Fetching processes...');
  const { data: processes, error: procError } = await supabase
    .from('processes')
    .select('process_id, process_name');

  if (procError) {
    console.error('Error fetching processes:', procError);
    return;
  }

  const processMap = {};
  processes.forEach(p => {
    processMap[p.process_name] = p.process_id;
  });
  console.log(`   Found ${processes.length} processes`);

  // 2. Read CSV
  console.log('\n2. Reading services CSV...');
  const csv = fs.readFileSync('data/service.csv', 'utf-8');
  const lines = csv.split('\n').slice(1).filter(l => l.trim());
  console.log(`   Found ${lines.length} services`);

  // 3. Parse and insert
  console.log('\n3. Importing services...');
  let success = 0;
  let failed = 0;

  for (const line of lines) {
    const [name, processName] = line.split(';').map(s => s.trim());

    if (!name || !processName) {
      console.log(`   ⚠ Skipping empty line`);
      continue;
    }

    // Map process name to DB name
    const dbProcessName = processNameMap[processName] || processName;
    const processId = processMap[dbProcessName];

    if (!processId) {
      console.log(`   ✗ Process not found: "${processName}" (mapped: "${dbProcessName}")`);
      failed++;
      continue;
    }

    const { error } = await supabase
      .from('services')
      .insert({
        name: name,
        process_id: processId,
        is_active: true
      });

    if (error) {
      console.log(`   ✗ ${name.substring(0, 50)}...: ${error.message}`);
      failed++;
    } else {
      console.log(`   ✓ ${name.substring(0, 60)}...`);
      success++;
    }
  }

  console.log(`\n4. Done! Success: ${success}, Failed: ${failed}`);

  // 5. Verify by process
  console.log('\n5. Services count by process:');
  const { data: services } = await supabase
    .from('services')
    .select('process_id, processes(process_name)')
    .order('process_id');

  const counts = {};
  services?.forEach(s => {
    const name = s.processes?.process_name || 'Unknown';
    counts[name] = (counts[name] || 0) + 1;
  });

  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
    console.log(`   ${count.toString().padStart(2)} | ${name}`);
  });
}

main().catch(console.error);
