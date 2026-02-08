const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lfsdttsvihyejplmzaaz.supabase.co',
  'sb_publishable_En8BLIpCy4F40M8o157ulA_WETR0E2S'
);

async function main() {
  console.log('=== MIGRATION: Weekly → Monthly Plans ===\n');

  // 1. Get all weekly plans
  console.log('1. Fetching weekly plans...');
  const { data: weeklyPlans, error: wpError } = await supabase
    .from('weekly_plans')
    .select('*')
    .order('weekly_date');

  if (wpError) {
    console.error('Error:', wpError);
    return;
  }
  console.log(`   Found ${weeklyPlans.length} weekly plans`);

  // 2. Group by quarterly_id + year + month
  console.log('\n2. Grouping by month...');
  const monthlyGroups = {};

  weeklyPlans.forEach(wp => {
    const date = new Date(wp.weekly_date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
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

  // 3. Create monthly plans
  console.log('\n3. Creating monthly plans...');
  const weeklyToMonthlyMap = {}; // weekly_id → monthly_plan_id

  for (const [key, group] of Object.entries(monthlyGroups)) {
    // Determine status
    let status = 'completed';
    if (group.year === 2026 && (group.month === 1 || group.month === 2)) {
      status = 'active';
    }

    // Get title from first plan
    const title = group.plans[0]?.expected_result?.substring(0, 200) || `План ${group.month}/${group.year}`;

    const { data: newPlan, error: insertError } = await supabase
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

    if (insertError) {
      console.log(`   ✗ ${group.year}-${group.month}: ${insertError.message}`);
      continue;
    }

    console.log(`   ✓ ${group.year}-${String(group.month).padStart(2, '0')} (${status}) - ${group.plans.length} weekly plans merged`);

    // Map weekly_ids to new monthly_plan_id
    group.plans.forEach(wp => {
      weeklyToMonthlyMap[wp.weekly_id] = newPlan.monthly_plan_id;
    });
  }

  // 4. Migrate assignees
  console.log('\n4. Migrating assignees...');
  const { data: assignees, error: assError } = await supabase
    .from('weekly_plan_assignees')
    .select('*');

  if (assError) {
    console.error('Error fetching assignees:', assError);
  } else {
    const monthlyAssignees = new Map(); // monthly_plan_id → Set of user_ids

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
          .insert({
            monthly_plan_id: monthlyPlanId,
            user_id: userId
          });

        if (!error) assigneeCount++;
      }
    }
    console.log(`   Migrated ${assigneeCount} assignees`);
  }

  // 5. Migrate tasks
  console.log('\n5. Migrating tasks...');
  const { data: tasks, error: taskError } = await supabase
    .from('weekly_tasks')
    .select('*');

  if (taskError) {
    console.error('Error fetching tasks:', taskError);
  } else {
    let taskCount = 0;
    let taskFailed = 0;

    for (const task of tasks) {
      const monthlyPlanId = weeklyToMonthlyMap[task.weekly_plan_id];
      if (!monthlyPlanId) {
        taskFailed++;
        continue;
      }

      const { error } = await supabase
        .from('daily_tasks')
        .insert({
          monthly_plan_id: monthlyPlanId,
          user_id: task.user_id,
          task_date: task.completed_at || task.created_at,
          description: task.description,
          spent_hours: task.spent_hours,
          attachment_url: task.attachment_url,
          document_number: task.document_number,
          created_at: task.created_at
        });

      if (error) {
        taskFailed++;
      } else {
        taskCount++;
      }
    }
    console.log(`   Migrated ${taskCount} tasks (${taskFailed} failed)`);
  }

  // 6. Summary
  console.log('\n=== MIGRATION COMPLETE ===');

  const { count: mpCount } = await supabase.from('monthly_plans').select('*', { count: 'exact', head: true });
  const { count: maCount } = await supabase.from('monthly_plan_assignees').select('*', { count: 'exact', head: true });
  const { count: dtCount } = await supabase.from('daily_tasks').select('*', { count: 'exact', head: true });

  console.log(`\nNew tables:`);
  console.log(`  monthly_plans: ${mpCount} records`);
  console.log(`  monthly_plan_assignees: ${maCount} records`);
  console.log(`  daily_tasks: ${dtCount} records`);
}

main().catch(console.error);
