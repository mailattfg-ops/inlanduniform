-- Migration: Add images and vendors to buttons table
ALTER TABLE public.buttons
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vendors JSONB DEFAULT '[]'::jsonb;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
