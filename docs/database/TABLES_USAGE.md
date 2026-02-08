# Database Tables & Views Usage Analysis

> Last updated: 2026-02-06

## Overview

This document tracks which database tables and views are actively used in the codebase.

- **Total tables:** 22 (added: projects, project_departments)
- **Used:** 20
- **Unused:** 2

---

## Tables Usage

### Core Planning Tables

| Table | Status | Description | Used In |
|-------|--------|-------------|---------|
| `annual_plans` | ✅ Used | Annual planning records | `plan-service.ts` |
| `quarterly_plans` | ✅ Used | Quarterly plans linked to annual | `plan-service.ts`, `WorkLogViewer.tsx` |
| `monthly_plans` | ✅ Used | Monthly plans with hours tracking | `AddTaskModal.tsx`, `plan-service.ts`, `usePlans.ts` |
| `weekly_plans` | ✅ Used | Legacy weekly plans | `plan-service.ts`, `excel-report-generator.ts` |

### Task Tables

| Table | Status | Description | Used In |
|-------|--------|-------------|---------|
| `daily_tasks` | ✅ Used | Daily task entries with hours | `AddTaskModal.tsx`, `task-service.ts`, `plan-service.ts` |
| `weekly_tasks` | ✅ Used | Legacy weekly task entries | `task-service.ts`, `WeeklyPlanDetails.tsx` |

### Assignment Tables (Many-to-Many)

| Table | Status | Description | Used In |
|-------|--------|-------------|---------|
| `monthly_plan_assignees` | ✅ Used | Users assigned to monthly plans | `PlanListSidebar.tsx`, `MonthlyPlanDetails.tsx` |
| `monthly_plan_companies` | ✅ Used | Companies linked to monthly plans | `MonthlyPlanDetails.tsx`, `WorkLogViewer.tsx` |
| `weekly_plan_assignees` | ✅ Used | Users assigned to weekly plans | `plan-service.ts`, `WeeklyPlanDetails.tsx` |
| `weekly_plan_companies` | ✅ Used | Companies linked to weekly plans | `plan-service.ts`, `WeeklyPlanDetails.tsx` |

### Reference Tables

| Table | Status | Description | Used In |
|-------|--------|-------------|---------|
| `processes` | ✅ Used | 11 security processes | `useProcesses.ts`, `MeasuresContent.tsx` |
| `services` | ✅ Used | Services linked to processes | `plan-service.ts` |
| `measures` | ✅ Used | KPI measures/activities | `plan-service.ts` (via `v_kpi_operational`) |
| `departments` | ✅ Used | Organization departments | `excel-report-generator.ts`, `EmployeeFormModal.tsx` |
| `companies` | ✅ Used | Client companies | `infrastructure.service.ts`, `WeeklyPlanDetails.tsx` |

### Projects Tables (NEW 2026-02-06)

| Table | Status | Description | Used In |
|-------|--------|-------------|---------|
| `projects` | ✅ Used | External projects/orders | `useProjects.ts`, `ReferencesContent.tsx`, `AddTaskModal.tsx` |
| `project_departments` | ✅ Used | M:N link projects ↔ departments | `useProjects.ts`, `ReferencesContent.tsx` |

### User & Activity Tables

| Table | Status | Description | Used In |
|-------|--------|-------------|---------|
| `user_profiles` | ✅ Used | User information and roles | `ActivityContent.tsx`, `user-profiles.ts` |
| `activities` | ✅ Used | Activity feed entries | `route.ts` (API reports) |
| `company_infrastructure` | ✅ Used | Company infrastructure data | `infrastructure.service.ts` |

### Unused Tables

| Table | Status | Description | Notes |
|-------|--------|-------------|-------|
| `kpi_entity_metrics` | ❌ Unused | KPI metrics storage | Was planned for KPI tracking, never implemented |
| `activity_logs` | ❌ Unused | Activity logging | Replaced by `activities` table |

---

## Views Usage

### Actively Used Views

| View | Description | Used In |
|------|-------------|---------|
| `v_user_details` | User profiles with department info | `auth/index.ts`, `employees.service.ts` |
| `v_annual_plans` | Annual plans with aggregations | `usePlans.ts` |
| `v_quarterly_plans` | Quarterly plans with details | `usePlans.ts` |
| `v_weekly_plans` | Weekly plans with details | `usePlans.ts`, `weekly-report-service.ts` |
| `v_kpi_operational` | KPI measures data | `usePlans.ts`, `MeasuresContent.tsx` |
| `v_kpi_current` | Current KPI status | `KPIContent.tsx` |
| `v_activity_feed` | Activity feed data | `activity.service.ts` |
| `v_quarterly_reports` | Quarterly report aggregations | `report-service.ts` |
| `v_monthly_company_report` | Monthly company reports | `monthly-report.service.ts` |
| `v_monthly_employee_report` | Monthly employee reports | `monthly-report.service.ts` |
| `v_companies_with_infrastructure` | Companies with infra data | `infrastructure.service.ts`, `MonthlyPlanDetails.tsx` |
| `v_projects_with_departments` | Projects with department arrays | `useProjects.ts`, `ReferencesContent.tsx` |

---

## Indexes

### Performance Indexes (Added 2026-02-05)

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| `idx_daily_tasks_user_date` | daily_tasks | (user_id, task_date) | Weekly hours calculation |
| `idx_monthly_plan_assignees_user` | monthly_plan_assignees | (user_id) | User plan lookup |
| `idx_user_profiles_user_role` | user_profiles | (user_id, role) | RLS policy optimization |
| `idx_monthly_plans_status` | monthly_plans | (status) | Status filtering |

### Removed Unused Indexes (2026-02-05)

- `idx_activity_logs_user_id`
- `idx_activity_logs_created_at`
- `activities_created_at_idx`
- `activities_user_id_idx`
- `activities_target_id_idx`
- `idx_annual_plans_status`
- `idx_measures_process_id`
- `idx_measures_category`
- `idx_measures_is_active`
- `idx_monthly_plans_service`
- `idx_monthly_plans_service_id`
- `idx_company_infrastructure_period`

---

## Cleanup Commands

### Check data before deletion

```sql
SELECT 'kpi_entity_metrics' as table_name, COUNT(*) as row_count FROM kpi_entity_metrics
UNION ALL
SELECT 'activity_logs', COUNT(*) FROM activity_logs;
```

### Drop unused tables (if confirmed empty/not needed)

```sql
DROP TABLE IF EXISTS kpi_entity_metrics CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
```

---

## Schema Relationships

```
annual_plans
    └── quarterly_plans (annual_plan_id)
            └── monthly_plans (quarterly_id)
                    ├── monthly_plan_assignees (monthly_plan_id)
                    ├── monthly_plan_companies (monthly_plan_id)
                    └── daily_tasks (monthly_plan_id)
                            └── projects (project_id) [optional]

processes
    └── services (process_id)
            └── monthly_plans (service_id)

processes
    └── measures (process_id)
            └── monthly_plans (measure_id)

departments
    ├── user_profiles (department_id)
    └── project_departments (department_id)
            └── projects (project_id) [M:N]

companies
    ├── monthly_plan_companies (company_id)
    ├── weekly_plan_companies (company_id)
    └── company_infrastructure (company_id)

projects (NEW)
    ├── project_departments (project_id) [M:N with departments]
    └── daily_tasks (project_id) [optional tag]
```

---

## Maintenance Notes

1. **Weekly cleanup:** Run `VACUUM ANALYZE` on high-traffic tables (daily_tasks, monthly_plans)
2. **Index monitoring:** Check `pg_stat_user_indexes` for unused indexes monthly
3. **Legacy tables:** `weekly_plans`, `weekly_tasks` are legacy - consider migration to monthly system
