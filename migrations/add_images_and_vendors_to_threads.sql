-- Migration: Add images and vendors to threads table
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vendors JSONB DEFAULT '[]'::jsonb;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
