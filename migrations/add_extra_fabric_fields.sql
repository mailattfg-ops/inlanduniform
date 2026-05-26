-- Migration: Add description, brand_type, quality, image to fabrics table
ALTER TABLE public.fabrics
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quality TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS image TEXT DEFAULT NULL;
