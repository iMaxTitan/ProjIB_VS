-- ============================================================
-- Migration: Enforce security_invoker for externally exposed views
-- ============================================================

ALTER VIEW IF EXISTS public.v_kpi_operational
  SET (security_invoker = on);

ALTER VIEW IF EXISTS public.v_user_details
  SET (security_invoker = on);
