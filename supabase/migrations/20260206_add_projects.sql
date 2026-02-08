-- ============================================
-- Міграція: Додавання сутності "Проекти"
-- Дата: 2026-02-06
-- Опис: Проект як тег до задачі для групування
--       роботи по зовнішніх замовленнях
-- ============================================

-- 1. Таблиця проектів (довідник)
CREATE TABLE IF NOT EXISTS projects (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES user_profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Зв'язок проект ↔ департаменти (M:N)
CREATE TABLE IF NOT EXISTS project_departments (
  project_id UUID REFERENCES projects(project_id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(department_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, department_id)
);

-- 3. Додаємо колонку project_id в daily_tasks
ALTER TABLE daily_tasks
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(project_id);

-- 4. Індекси
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(project_name);
CREATE INDEX IF NOT EXISTS idx_project_departments_project ON project_departments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_departments_dept ON project_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_project ON daily_tasks(project_id) WHERE project_id IS NOT NULL;

-- 5. Trigger для updated_at
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_projects_updated_at ON projects;
CREATE TRIGGER trigger_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at();

-- 6. View для зручного отримання проектів з департаментами
CREATE OR REPLACE VIEW v_projects_with_departments AS
SELECT
  p.project_id,
  p.project_name,
  p.description,
  p.is_active,
  p.created_by,
  p.created_at,
  p.updated_at,
  COALESCE(
    array_agg(pd.department_id) FILTER (WHERE pd.department_id IS NOT NULL),
    '{}'::uuid[]
  ) as department_ids,
  COALESCE(
    array_agg(d.department_name ORDER BY d.department_name) FILTER (WHERE d.department_id IS NOT NULL),
    '{}'::text[]
  ) as department_names
FROM projects p
LEFT JOIN project_departments pd ON p.project_id = pd.project_id
LEFT JOIN departments d ON pd.department_id = d.department_id
GROUP BY p.project_id, p.project_name, p.description, p.is_active, p.created_by, p.created_at, p.updated_at;

-- 7. RLS політики
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_departments ENABLE ROW LEVEL SECURITY;

-- Projects: всі можуть читати
DROP POLICY IF EXISTS "Projects viewable by all authenticated" ON projects;
CREATE POLICY "Projects viewable by all authenticated" ON projects
  FOR SELECT
  TO authenticated
  USING (true);

-- Projects: chief/head можуть керувати
DROP POLICY IF EXISTS "Projects manageable by chief_head" ON projects;
CREATE POLICY "Projects manageable by chief_head" ON projects
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('chief', 'head')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('chief', 'head')
    )
  );

-- Project_departments: всі можуть читати
DROP POLICY IF EXISTS "Project_departments viewable by all" ON project_departments;
CREATE POLICY "Project_departments viewable by all" ON project_departments
  FOR SELECT
  TO authenticated
  USING (true);

-- Project_departments: chief/head можуть керувати
DROP POLICY IF EXISTS "Project_departments manageable by chief_head" ON project_departments;
CREATE POLICY "Project_departments manageable by chief_head" ON project_departments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('chief', 'head')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('chief', 'head')
    )
  );

-- 8. Функція для отримання проектів по департаменту користувача
CREATE OR REPLACE FUNCTION get_projects_for_user(p_user_id UUID)
RETURNS TABLE (
  project_id UUID,
  project_name VARCHAR(255),
  description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    p.project_id,
    p.project_name,
    p.description
  FROM projects p
  JOIN project_departments pd ON p.project_id = pd.project_id
  JOIN user_profiles u ON pd.department_id = u.department_id
  WHERE u.user_id = p_user_id
    AND p.is_active = true
  ORDER BY p.project_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Коментарі
COMMENT ON TABLE projects IS 'Довідник проектів - зовнішні замовлення/роботи';
COMMENT ON TABLE project_departments IS 'Зв''язок проектів з департаментами (M:N)';
COMMENT ON COLUMN daily_tasks.project_id IS 'Опціональна прив''язка задачі до проекту';
