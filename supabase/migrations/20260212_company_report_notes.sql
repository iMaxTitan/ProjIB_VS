-- Таблица для хранения AI-примечаний к отчётам по предприятиям (по мероприятиям)
CREATE TABLE company_report_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
  measure_id uuid NOT NULL REFERENCES measures(measure_id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, measure_id, year, month)
);

ALTER TABLE company_report_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON company_report_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_crn_lookup ON company_report_notes (company_id, year, month);
