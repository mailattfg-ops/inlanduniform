-- Migration: Add latest_sam, vendors and images to fabrics table
ALTER TABLE public.fabrics
  ADD COLUMN IF NOT EXISTS latest_sam NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS vendors JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';

