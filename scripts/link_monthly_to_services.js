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

// Normalize text for comparison
function normalize(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[''`"«»]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/іб/g, 'інформаційної безпеки')
    .replace(/іа/g, 'інформаційних активів')
    .replace(/піб/g, 'політики інформаційної безпеки')
    .replace(/іс/g, 'інформаційних систем')
    .trim();
}

// Calculate similarity score (Levenshtein-like matching)
function similarity(s1, s2) {
  const n1 = normalize(s1);
  const n2 = normalize(s2);

  // Check for exact match first
  if (n1 === n2) return 1.0;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;

  // Check word overlap
  const words1 = new Set(n1.split(' ').filter(w => w.length > 3));
  const words2 = new Set(n2.split(' ').filter(w => w.length > 3));

  let matches = 0;
  for (const w of words1) {
    if (words2.has(w)) matches++;
  }

  const total = Math.max(words1.size, words2.size);
  return total > 0 ? matches / total : 0;
}

async function linkMonthlyToServices() {
  // Get all monthly plans without service_id
  const { data: monthlyPlans, error: mpError } = await supabase
    .from('monthly_plans')
    .select('monthly_plan_id, quarterly_id, title, year, month')
    .is('service_id', null);

  if (mpError) {
    console.error('Error fetching monthly_plans:', mpError);
    return;
  }

  // Get all services
  const { data: services, error: svcError } = await supabase
    .from('services')
    .select('service_id, process_id, name');

  if (svcError) {
    console.error('Error fetching services:', svcError);
    return;
  }

  console.log(`Found ${monthlyPlans.length} monthly plans without service_id`);
  console.log(`Found ${services.length} services\n`);

  const updates = [];
  const unmatched = [];

  for (const mp of monthlyPlans) {
    if (!mp.title) {
      unmatched.push({ plan: mp, reason: 'No title' });
      continue;
    }

    // Find best matching service
    let bestMatch = null;
    let bestScore = 0;

    for (const svc of services) {
      const score = similarity(mp.title, svc.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = svc;
      }
    }

    if (bestScore >= 0.5) {
      updates.push({
        monthly_plan_id: mp.monthly_plan_id,
        service_id: bestMatch.service_id,
        title: mp.title,
        service_name: bestMatch.name,
        score: bestScore
      });
    } else {
      unmatched.push({ plan: mp, bestMatch, bestScore, reason: 'Low score' });
    }
  }

  console.log('=== MATCHES (score >= 0.5) ===\n');
  for (const u of updates) {
    console.log(`[${(u.score * 100).toFixed(0)}%] ${u.title.slice(0, 50)}`);
    console.log(`    → ${u.service_name.slice(0, 50)}\n`);
  }

  console.log('\n=== UNMATCHED ===\n');
  for (const u of unmatched) {
    console.log(`PLAN: ${(u.plan.title || 'NO TITLE').slice(0, 60)}`);
    if (u.bestMatch) {
      console.log(`  Best match (${(u.bestScore * 100).toFixed(0)}%): ${u.bestMatch.name.slice(0, 50)}`);
    }
    console.log(`  Reason: ${u.reason}\n`);
  }

  // Ask to proceed with updates
  console.log(`\n=== SUMMARY ===`);
  console.log(`Matched: ${updates.length}`);
  console.log(`Unmatched: ${unmatched.length}`);

  if (updates.length > 0 && process.argv.includes('--apply')) {
    console.log('\nApplying updates...');

    for (const u of updates) {
      const { error } = await supabase
        .from('monthly_plans')
        .update({ service_id: u.service_id })
        .eq('monthly_plan_id', u.monthly_plan_id);

      if (error) {
        console.error(`Error updating ${u.monthly_plan_id}:`, error);
      } else {
        console.log(`✓ Updated: ${u.title.slice(0, 40)}...`);
      }
    }

    console.log('\nDone!');
  } else if (updates.length > 0) {
    console.log('\nRun with --apply to apply updates');
  }
}

linkMonthlyToServices();
