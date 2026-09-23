-- ==============================================================================
-- FORMA APPARELS ERP - MIGRATION 09: COLUMN TYPE HARDENING
-- Ensures full compatibility with Supabase Auth UUIDs and Warehouse Fabric UUIDs.
-- ==============================================================================

-- 1. Alter record_activity_logs.performed_by to TEXT (stores UUID or integer user IDs)
ALTER TABLE IF EXISTS public.record_activity_logs 
  ALTER COLUMN performed_by TYPE TEXT USING performed_by::TEXT;

-- 2. Alter fabric_consumption_logs.fabric_id to TEXT (stores UUID from fabrics table)
ALTER TABLE IF EXISTS public.fabric_consumption_logs 
  ALTER COLUMN fabric_id TYPE TEXT USING fabric_id::TEXT;

-- 3. Ensure index exists on job_card_id and sub_job_card_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_fabric_consumption_logs_jc ON public.fabric_consumption_logs(job_card_id);
CREATE INDEX IF NOT EXISTS idx_record_activity_logs_entity ON public.record_activity_logs(entity_type, entity_id);

-- 4. Optional dedicated columns on child_job_cards for direct indexing
ALTER TABLE IF EXISTS public.child_job_cards
  ADD COLUMN IF NOT EXISTS fabric_code TEXT,
  ADD COLUMN IF NOT EXISTS fabric_name TEXT,
  ADD COLUMN IF NOT EXISTS fabric_length NUMERIC;
