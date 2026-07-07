-- Migration: Add remarks JSONB field to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS remarks JSONB DEFAULT NULL;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
