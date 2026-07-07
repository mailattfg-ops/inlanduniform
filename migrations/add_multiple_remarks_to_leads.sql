-- Migration: Modify remarks from TEXT to JSONB in leads
ALTER TABLE public.leads ALTER COLUMN remarks TYPE JSONB USING 
  CASE 
    WHEN remarks IS NULL OR remarks = '' THEN '[]'::jsonb
    ELSE json_build_array(json_build_object('date', to_char(created_at, 'DD Mon YYYY'), 'time', to_char(created_at, 'HH24:MI'), 'text', remarks))::jsonb
  END;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
