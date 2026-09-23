-- Migration: Add email column to public.leads table
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
