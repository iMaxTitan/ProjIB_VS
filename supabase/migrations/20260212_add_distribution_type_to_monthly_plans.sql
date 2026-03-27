-- Добавляем тип распределения часов по предприятиям
-- by_servers — пропорционально серверам
-- by_workstations — пропорционально рабочим станциям
-- even — поровну между выбранными

ALTER TABLE monthly_plans
  ADD COLUMN distribution_type text DEFAULT 'even' NOT NULL
  CHECK (distribution_type IN ('by_servers', 'by_workstations', 'even'));
тог