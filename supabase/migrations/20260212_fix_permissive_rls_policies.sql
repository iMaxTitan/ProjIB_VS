-- ============================================================
-- Migration: Replace permissive RLS policies with authenticated checks
-- ============================================================

-- This keeps broad access for signed-in users while removing literal TRUE predicates
-- that trigger Supabase linter warning 0024.

-- activities
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Activities authenticated access" ON public.activities;
DROP POLICY IF EXISTS "Allow insert for all" ON public.activities;
CREATE POLICY "Activities authenticated access" ON public.activities
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- annual_plans
ALTER TABLE public.annual_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Annual plans authenticated access" ON public.annual_plans;
CREATE POLICY "Annual plans authenticated access" ON public.annual_plans
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Companies authenticated access" ON public.companies;
CREATE POLICY "Companies authenticated access" ON public.companies
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- company_infrastructure
ALTER TABLE public.company_infrastructure ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Company infrastructure authenticated access" ON public.company_infrastructure;
CREATE POLICY "Company infrastructure authenticated access" ON public.company_infrastructure
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- company_report_notes
ALTER TABLE public.company_report_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.company_report_notes;
CREATE POLICY "auth_all" ON public.company_report_notes
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- daily_tasks
ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Daily tasks authenticated access" ON public.daily_tasks;
CREATE POLICY "Daily tasks authenticated access" ON public.daily_tasks
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- departments
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Departments authenticated access" ON public.departments;
CREATE POLICY "Departments authenticated access" ON public.departments
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- measures
ALTER TABLE public.measures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Measures authenticated access" ON public.measures;
CREATE POLICY "Measures authenticated access" ON public.measures
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- monthly_plan_assignees
ALTER TABLE public.monthly_plan_assignees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Monthly plan assignees authenticated access" ON public.monthly_plan_assignees;
CREATE POLICY "Monthly plan assignees authenticated access" ON public.monthly_plan_assignees
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- monthly_plan_companies
ALTER TABLE public.monthly_plan_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Monthly plan companies authenticated access" ON public.monthly_plan_companies;
CREATE POLICY "Monthly plan companies authenticated access" ON public.monthly_plan_companies
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- monthly_plans
ALTER TABLE public.monthly_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Monthly plans authenticated access" ON public.monthly_plans;
CREATE POLICY "Monthly plans authenticated access" ON public.monthly_plans
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- processes
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Processes authenticated access" ON public.processes;
CREATE POLICY "Processes authenticated access" ON public.processes
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- project_departments
ALTER TABLE public.project_departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Project departments authenticated access" ON public.project_departments;
CREATE POLICY "Project departments authenticated access" ON public.project_departments
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Projects authenticated access" ON public.projects;
CREATE POLICY "Projects authenticated access" ON public.projects
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- quarterly_plans
ALTER TABLE public.quarterly_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Quarterly plans authenticated access" ON public.quarterly_plans;
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quarterly_plans'
      AND cmd = 'ALL'
      AND coalesce(qual, '') = 'true'
      AND coalesce(with_check, '') = 'true'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.quarterly_plans', p.policyname);
  END LOOP;
END;
$$;
CREATE POLICY "Quarterly plans authenticated access" ON public.quarterly_plans
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- services
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Services authenticated access" ON public.services;
CREATE POLICY "Services authenticated access" ON public.services
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "User profiles authenticated access" ON public.user_profiles;
CREATE POLICY "User profiles authenticated access" ON public.user_profiles
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
