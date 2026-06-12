-- Migration: Replace old partial unique constraint with variant signature index
-- on product_design_variants table.
-- Run this in Supabase SQL Editor.

-- 1. Drop the old constraint that only covered (product_id, button_id, thread_id)
ALTER TABLE public.product_design_variants
  DROP CONSTRAINT IF EXISTS product_design_variants_product_id_button_id_thread_id_key;

-- 2. Add a new unique index on (product_id, material_combination)
--    This allows multiple variants per product as long as their full config signature differs.
--    NULL material_combination rows (legacy base-product rows) are excluded from uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_design_variants_signature
  ON public.product_design_variants (product_id, material_combination)
  WHERE material_combination IS NOT NULL;

-- Done.
