-- Migration: Add qr_image TEXT column to company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS qr_image TEXT;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
