-- Migration: Add brand_name, quantity, shade, width fields to fabrics table
ALTER TABLE public.fabrics
  ADD COLUMN IF NOT EXISTS brand_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shade TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS width TEXT DEFAULT NULL; -- values: '36', '44', '58'
