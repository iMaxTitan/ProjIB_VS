-- Add status column to plan_initiatives (per-plan progress tracking)
-- Same initiative can be at different stages in different plans

ALTER TABLE plan_initiatives
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'completed'));

-- Migrate statuses from old quarterly_plan_initiatives
UPDATE plan_initiatives pi
SET status = qpi.status
FROM quarterly_plan_initiatives qpi
JOIN initiatives i ON i.title = qpi.title
WHERE pi.initiative_id = i.id
  AND pi.quarterly_plan_id = qpi.quarterly_plan_id;
