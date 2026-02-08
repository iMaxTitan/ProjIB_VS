-- ============================================
-- Fix: Оновлення RLS для projects
-- Причина: auth.uid() не працює з Azure AD
-- ============================================

-- Видаляємо старі обмежувальні policies
DROP POLICY IF EXISTS "Projects manageable by chief_head" ON projects;
DROP POLICY IF EXISTS "Project_departments manageable by chief_head" ON project_departments;

-- Створюємо прості policies що дозволяють всі операції
-- (перевірка ролей відбувається на рівні UI/API)

CREATE POLICY "Projects full access" ON projects
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Project_departments full access" ON project_departments
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Або взагалі вимикаємо RLS якщо не потрібен
-- ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE project_departments DISABLE ROW LEVEL SECURITY;
