-- Migration: Add remarks TEXT field to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
