const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

async function main() {
  console.log('=== CLEARING AND RE-MIGRATING ===\n');

  // 1. Clear existing data
  console.log('1. Clearing existing data...');

  await supabase.from('daily_tasks').delete().neq('daily_task_id', '00000000-0000-0000-0000-000000000000');
  console.log('   ✓ daily_tasks cleared');

  await supabase.from('monthly_plan_assignees').delete().neq('monthly_plan_id', '00000000-0000-0000-0000-000000000000');
  console.log('   ✓ monthly_plan_assignees cleared');

  await supabase.from('monthly_plans').delete().neq('monthly_plan_id', '00000000-0000-0000-0000-000000000000');
  console.log('   ✓ monthly_plans cleared');

  // 2. Re-run migration
  console.log('\n2. Starting migration...\n');

  // Get all weekly plans
  const { data: weeklyPlans } = await supabase
    .from('weekly_plans')
    .select('*')
    .order('weekly_date');

  console.log(`   Found ${weeklyPlans.length} weekly plans`);

  // Group by quarterly_id + year + month
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

  console.log(`   Created ${Object.keys(monthlyGroups).length} monthly groups`);

  // Create monthly plans
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

    if (error) {
      console.log(`   ✗ ${group.year}-${group.month}: ${error.message}`);
      continue;
    }

    group.plans.forEach(wp => {
      weeklyToMonthlyMap[wp.weekly_id] = newPlan.monthly_plan_id;
    });
  }

  const { count: mpCount } = await supabase.from('monthly_plans').select('*', { count: 'exact', head: true });
  console.log(`   ✓ Created ${mpCount} monthly plans`);

  // Migrate assignees
  console.log('\n4. Migrating assignees...');
  const { data: assignees } = await supabase.from('weekly_plan_assignees').select('*');

  const monthlyAssignees = new Map();
  assignees?.forEach(a => {
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
  console.log(`   ✓ Migrated ${assigneeCount} assignees`);

  // Migrate tasks
  console.log('\n5. Migrating tasks...');
  const { data: tasks } = await supabase.from('weekly_tasks').select('*');

  let taskCount = 0;
  for (const task of tasks || []) {
    const monthlyPlanId = weeklyToMonthlyMap[task.weekly_plan_id];
    if (!monthlyPlanId) continue;

    const { error } = await supabase
      .from('daily_tasks')
      .insert({
        monthly_plan_id: monthlyPlanId,
        user_id: task.user_id,
        task_date: task.completed_at || task.created_at?.split('T')[0],
        description: task.description,
        spent_hours: task.spent_hours,
        attachment_url: task.attachment_url,
        document_number: task.document_number,
        created_at: task.created_at
      });

    if (!error) taskCount++;
  }
  console.log(`   ✓ Migrated ${taskCount} tasks`);

  // Summary
  console.log('\n=== MIGRATION COMPLETE ===');
  const { count: maCount } = await supabase.from('monthly_plan_assignees').select('*', { count: 'exact', head: true });
  const { count: dtCount } = await supabase.from('daily_tasks').select('*', { count: 'exact', head: true });

  console.log(`\n   monthly_plans: ${mpCount}`);
  console.log(`   monthly_plan_assignees: ${maCount}`);
  console.log(`   daily_tasks: ${dtCount}`);
}

main().catch(console.error);
