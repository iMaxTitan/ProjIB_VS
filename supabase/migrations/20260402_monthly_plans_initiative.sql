-- Allow monthly plans to be linked to initiatives (alongside procedures)
-- An initiative at month level = same monthly plan structure as procedure

ALTER TABLE monthly_plans
  ADD COLUMN IF NOT EXISTS initiative_id uuid REFERENCES initiatives(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_monthly_plans_initiative ON monthly_plans(initiative_id) WHERE initiative_id IS NOT NULL;
