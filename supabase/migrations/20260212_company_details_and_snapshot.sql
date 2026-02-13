-- ============================================================
-- Миграция: Расширение companies + снапшот реквизитов в infrastructure
-- ============================================================

-- 1. Новые колонки в companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS company_full_name text,
  ADD COLUMN IF NOT EXISTS director text,
  ADD COLUMN IF NOT EXISTS contract_number text,
  ADD COLUMN IF NOT EXISTS contract_date date,
  ADD COLUMN IF NOT EXISTS rate_per_hour numeric(10,2);

-- 2. Снапшот-колонки в company_infrastructure
ALTER TABLE company_infrastructure
  ADD COLUMN IF NOT EXISTS company_full_name text,
  ADD COLUMN IF NOT EXISTS director text,
  ADD COLUMN IF NOT EXISTS contract_number text,
  ADD COLUMN IF NOT EXISTS contract_date date,
  ADD COLUMN IF NOT EXISTS rate_per_hour numeric(10,2);

-- 3. Пересоздать view v_companies_with_infrastructure
DROP VIEW IF EXISTS v_companies_with_infrastructure;

CREATE VIEW v_companies_with_infrastructure
WITH (security_invoker = on)
AS
SELECT
  c.company_id,
  c.company_name,
  c.company_full_name,
  c.director,
  c.contract_number,
  c.contract_date,
  c.rate_per_hour,
  ci.infrastructure_id,
  ci.period_year,
  ci.period_month,
  COALESCE(ci.servers_count, 0)    AS servers_count,
  COALESCE(ci.workstations_count, 0) AS workstations_count,
  ci.notes,
  ci.created_at                     AS infrastructure_updated_at,
  ci.created_by,
  COALESCE(ci.servers_count, 0) > 0 AS has_servers,
  COALESCE(ci.servers_count, 0) + COALESCE(ci.workstations_count, 0) AS total_endpoints,
  COALESCE(ci.servers_count, 0)     AS total_servers,
  COALESCE(ci.workstations_count, 0) AS total_workstations,
  CASE
    WHEN COALESCE(ci.servers_count, 0) + COALESCE(ci.workstations_count, 0) > 0
    THEN ROUND(
      COALESCE(ci.workstations_count, 0)::numeric
      / (COALESCE(ci.servers_count, 0) + COALESCE(ci.workstations_count, 0)) * 100, 1
    )
    ELSE 0
  END AS workstations_percentage,
  CASE
    WHEN COALESCE(ci.servers_count, 0) + COALESCE(ci.workstations_count, 0) > 0
    THEN ROUND(
      COALESCE(ci.servers_count, 0)::numeric
      / (COALESCE(ci.servers_count, 0) + COALESCE(ci.workstations_count, 0)) * 100, 1
    )
    ELSE 0
  END AS servers_percentage,
  COALESCE(hist.cnt, 0)::integer AS history_records_count
FROM companies c
LEFT JOIN LATERAL (
  SELECT *
  FROM company_infrastructure
  WHERE company_id = c.company_id
  ORDER BY period_year DESC, period_month DESC
  LIMIT 1
) ci ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS cnt
  FROM company_infrastructure
  WHERE company_id = c.company_id
) hist ON true
ORDER BY c.company_name;

-- 4. Обновить RPC manage_company_infrastructure
CREATE OR REPLACE FUNCTION manage_company_infrastructure(
  p_action text,
  p_infrastructure_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_period_year integer DEFAULT NULL,
  p_period_month integer DEFAULT NULL,
  p_servers_count integer DEFAULT 0,
  p_workstations_count integer DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_company_full_name text DEFAULT NULL,
  p_director text DEFAULT NULL,
  p_contract_number text DEFAULT NULL,
  p_contract_date date DEFAULT NULL,
  p_rate_per_hour numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_action = 'create' THEN
    INSERT INTO company_infrastructure (
      company_id, period_year, period_month,
      servers_count, workstations_count, notes,
      created_by,
      company_full_name, director, contract_number, contract_date, rate_per_hour
    ) VALUES (
      p_company_id, p_period_year, p_period_month,
      p_servers_count, p_workstations_count, p_notes,
      p_user_id,
      p_company_full_name, p_director, p_contract_number, p_contract_date, p_rate_per_hour
    )
    RETURNING infrastructure_id INTO v_id;

    RETURN jsonb_build_object('infrastructure_id', v_id);

  ELSIF p_action = 'update' THEN
    UPDATE company_infrastructure SET
      servers_count      = p_servers_count,
      workstations_count = p_workstations_count,
      notes              = p_notes,
      company_full_name  = p_company_full_name,
      director           = p_director,
      contract_number    = p_contract_number,
      contract_date      = p_contract_date,
      rate_per_hour      = p_rate_per_hour
    WHERE infrastructure_id = p_infrastructure_id;

    RETURN jsonb_build_object('infrastructure_id', p_infrastructure_id);

  ELSIF p_action = 'delete' THEN
    DELETE FROM company_infrastructure
    WHERE infrastructure_id = p_infrastructure_id;

    RETURN jsonb_build_object('infrastructure_id', p_infrastructure_id);

  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action;
  END IF;
END;
$$;

-- 5. Обновить RPC get_company_infrastructure_history
CREATE OR REPLACE FUNCTION get_company_infrastructure_history(
  p_company_id uuid,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  infrastructure_id uuid,
  period_year integer,
  period_month integer,
  period_label text,
  servers_count integer,
  workstations_count integer,
  total_endpoints integer,
  notes text,
  created_at timestamptz,
  created_by_name text,
  company_full_name text,
  director text,
  contract_number text,
  contract_date date,
  rate_per_hour numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months text[] := ARRAY[
    'Січень','Лютий','Березень','Квітень',
    'Травень','Червень','Липень','Серпень',
    'Вересень','Жовтень','Листопад','Грудень'
  ];
BEGIN
  RETURN QUERY
  SELECT
    ci.infrastructure_id,
    ci.period_year,
    ci.period_month,
    v_months[ci.period_month] || ' ' || ci.period_year::text AS period_label,
    ci.servers_count,
    ci.workstations_count,
    ci.servers_count + ci.workstations_count AS total_endpoints,
    ci.notes,
    ci.created_at,
    up.full_name AS created_by_name,
    ci.company_full_name,
    ci.director,
    ci.contract_number,
    ci.contract_date,
    ci.rate_per_hour
  FROM company_infrastructure ci
  LEFT JOIN user_profiles up ON up.user_id = ci.created_by
  WHERE ci.company_id = p_company_id
  ORDER BY ci.period_year DESC, ci.period_month DESC
  LIMIT p_limit;
END;
$$;

-- 6. RLS: убедиться что companies имеет UPDATE для authenticated
-- (текущая политика FOR ALL уже покрывает UPDATE)
-- Если нужно — раскомментировать:
-- CREATE POLICY companies_update ON companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Готово!
