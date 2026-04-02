-- Initiatives: справочник инициатив (change-контур, параллельно процедурам)
-- Инициатива — независимая сущность, привязывается к планам через plan_initiatives

-- 1. Справочник инициатив
CREATE TABLE IF NOT EXISTS initiatives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  source        text NOT NULL DEFAULT 'planned' CHECK (source IN ('planned', 'unplanned')),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Связь инициатив с планами (M:N — одна инициатива может быть в планах разных подразделений/уровней)
CREATE TABLE IF NOT EXISTS plan_initiatives (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id       uuid NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  annual_plan_id      uuid REFERENCES annual_plans(annual_id) ON DELETE CASCADE,
  quarterly_plan_id   uuid REFERENCES quarterly_plans(quarterly_id) ON DELETE CASCADE,
  monthly_plan_id     uuid REFERENCES monthly_plans(monthly_plan_id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- Ровно одно из трёх полей плана должно быть заполнено
  CONSTRAINT plan_initiatives_one_plan CHECK (
    (annual_plan_id IS NOT NULL)::int +
    (quarterly_plan_id IS NOT NULL)::int +
    (monthly_plan_id IS NOT NULL)::int = 1
  )
);

-- Индексы
CREATE INDEX idx_plan_initiatives_initiative ON plan_initiatives(initiative_id);
CREATE INDEX idx_plan_initiatives_annual ON plan_initiatives(annual_plan_id) WHERE annual_plan_id IS NOT NULL;
CREATE INDEX idx_plan_initiatives_quarterly ON plan_initiatives(quarterly_plan_id) WHERE quarterly_plan_id IS NOT NULL;
CREATE INDEX idx_plan_initiatives_monthly ON plan_initiatives(monthly_plan_id) WHERE monthly_plan_id IS NOT NULL;

-- 3. Миграция данных из quarterly_plan_initiatives → initiatives + plan_initiatives
-- Дедупликация по title: одна инициатива → несколько привязок к кварталам
WITH unique_initiatives AS (
  INSERT INTO initiatives (title, description, source, is_active)
  SELECT DISTINCT ON (title) title, description, 'planned', true
  FROM quarterly_plan_initiatives
  ORDER BY title, id
  RETURNING id, title
)
INSERT INTO plan_initiatives (initiative_id, quarterly_plan_id)
SELECT ui.id, qpi.quarterly_plan_id
FROM quarterly_plan_initiatives qpi
JOIN unique_initiatives ui ON ui.title = qpi.title;

-- RLS
ALTER TABLE initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_initiatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "initiatives_read" ON initiatives FOR SELECT USING (true);
CREATE POLICY "initiatives_write" ON initiatives FOR ALL USING (true);

CREATE POLICY "plan_initiatives_read" ON plan_initiatives FOR SELECT USING (true);
CREATE POLICY "plan_initiatives_write" ON plan_initiatives FOR ALL USING (true);
