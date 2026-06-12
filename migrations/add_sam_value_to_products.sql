-- Migration: Add sam_value column to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sam_value NUMERIC(8,4) DEFAULT NULL;

-- sam_value stores Standard Allowed Minutes (SAM) as a decimal/fraction
-- e.g. 1.25 = 1 minute and 15 seconds allowed per garment operation
