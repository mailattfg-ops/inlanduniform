-- Migration: Alter fabric_consumption_logs.fabric_id to TEXT
-- Ensures compatibility with both integer IDs and Supabase UUIDs (e.g. from fabrics table)
ALTER TABLE IF EXISTS public.fabric_consumption_logs 
  ALTER COLUMN fabric_id TYPE TEXT USING fabric_id::TEXT;
