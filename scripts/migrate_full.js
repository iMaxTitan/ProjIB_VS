const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

// Fetch all records with pagination
async function fetchAll(table, select = '*') {
  const allData = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData.push(...data);
    from += pageSize;

    if (data.length < pageSize) break;
  }

  return allData;
}

async function main() {
  console.log('=== FULL MIGRATION ===\n');

  // 1. Clear
  console.log('1. Clearing...');
  await supabase.from('daily_tasks').delete().neq('daily_task_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('monthly_plan_assignees').delete().neq('monthly_plan_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('monthly_plans').delete().neq('monthly_plan_id', '00000000-0000-0000-0000-000000000000');
  console.log('   Done');

  // 2. Fetch all weekly plans
  console.log('\n2. Fetching all weekly plans...');
  const weeklyPlans = await fetchAll('weekly_plans');
  console.log(`   Found ${weeklyPlans.length} weekly plans`);

  // 3. Group by quarterly_id + year + month
  const monthlyGroups = {};
  weeklyPlans.forEach(wp => {
    const date = new Date(wp.weekly_date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${wp.quarterly_id}_${year}_${month}`;

    if (!monthlyGroups[key]) {
      monthlyGroups[key] = {
        quarterly_id: wp.quarterly_id,
        year,
        month,
        plans: [],
        totalHours: 0,
        created_by: wp.created_by,
        created_at: wp.created_at
      };
    }
    monthlyGroups[key].plans.push(wp);
    monthlyGroups[key].totalHours += wp.planned_hours || 0;
  });
  console.log(`   ${Object.keys(monthlyGroups).length} monthly groups`);

  // 4. Create monthly plans
  console.log('\n3. Creating monthly plans...');
  const weeklyToMonthlyMap = {};

  for (const [key, group] of Object.entries(monthlyGroups)) {
    let status = 'completed';
    if (group.year === 2026 && (group.month === 1 || group.month === 2)) {
      status = 'active';
    }

    const title = group.plans[0]?.expected_result?.substring(0, 200) || `План ${group.month}/${group.year}`;

    const { data: newPlan, error } = await supabase
      .from('monthly_plans')
      .insert({
        quarterly_id: group.quarterly_id,
        year: group.year,
        month: group.month,
        title: title,
        status: status,
        planned_hours: group.totalHours,
        created_by: group.created_by,
        created_at: group.created_at
      })
      .select()
      .single();

    if (!error && newPlan) {
      group.plans.forEach(wp => {
        weeklyToMonthlyMap[wp.weekly_id] = newPlan.monthly_plan_id;
      });
    }
  }

  const { count: mpCount } = await supabase.from('monthly_plans').select('*', { count: 'exact', head: true });
  console.log(`   Created ${mpCount} monthly plans`);

  // 5. Migrate assignees
  console.log('\n4. Migrating assignees...');
  const assignees = await fetchAll('weekly_plan_assignees');
  console.log(`   Found ${assignees.length} assignees`);

  const monthlyAssignees = new Map();
  assignees.forEach(a => {
    const monthlyPlanId = weeklyToMonthlyMap[a.weekly_plan_id];
    if (monthlyPlanId) {
      if (!monthlyAssignees.has(monthlyPlanId)) {
        monthlyAssignees.set(monthlyPlanId, new Set());
      }
      monthlyAssignees.get(monthlyPlanId).add(a.user_id);
    }
  });

  let assigneeCount = 0;
  for (const [monthlyPlanId, userIds] of monthlyAssignees) {
    for (const userId of userIds) {
      const { error } = await supabase
        .from('monthly_plan_assignees')
        .insert({ monthly_plan_id: monthlyPlanId, user_id: userId });
      if (!error) assigneeCount++;
    }
  }
  console.log(`   Migrated ${assigneeCount} unique assignees`);

  // 6. Migrate tasks in batches
  console.log('\n5. Migrating tasks...');
  const tasks = await fetchAll('weekly_tasks');
  console.log(`   Found ${tasks.length} tasks`);

  let taskCount = 0;
  let taskFailed = 0;
  const batchSize = 100;

  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const inserts = [];

    for (const task of batch) {
      const monthlyPlanId = weeklyToMonthlyMap[task.weekly_plan_id];
      if (!monthlyPlanId) {
        taskFailed++;
        continue;
      }

      inserts.push({
        monthly_plan_id: monthlyPlanId,
        user_id: task.user_id,
        task_date: task.completed_at?.split('T')[0] || task.created_at?.split('T')[0],
        description: task.description,
        spent_hours: task.spent_hours,
        attachment_url: task.attachment_url,
        document_number: task.document_number,
        created_at: task.created_at
      });
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from('daily_tasks').insert(inserts);
      if (!error) {
        taskCount += inserts.length;
      } else {
        taskFailed += inserts.length;
      }
    }

    // Progress
    if ((i + batchSize) % 5000 === 0 || i + batchSize >= tasks.length) {
      console.log(`   Progress: ${Math.min(i + batchSize, tasks.length)}/${tasks.length}`);
    }
  }

  console.log(`   Migrated ${taskCount} tasks (${taskFailed} failed)`);

  // Summary
  console.log('\n=== COMPLETE ===');
  const { count: maCount } = await supabase.from('monthly_plan_assignees').select('*', { count: 'exact', head: true });
  const { count: dtCount } = await supabase.from('daily_tasks').select('*', { count: 'exact', head: true });

  console.log(`   monthly_plans: ${mpCount}`);
  console.log(`   monthly_plan_assignees: ${maCount}`);
  console.log(`   daily_tasks: ${dtCount}`);
}

main().catch(console.error);
