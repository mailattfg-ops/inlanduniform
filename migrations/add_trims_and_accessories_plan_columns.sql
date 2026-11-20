-- Migration: Add Trims and Accessories Plan Columns
-- Approved schema plan from spreadsheet specification

-- 1. Trims table: add structured columns
ALTER TABLE IF EXISTS public.trims
  ADD COLUMN IF NOT EXISTS brand_name TEXT,
  ADD COLUMN IF NOT EXISTS specification TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS shade_no TEXT,
  ADD COLUMN IF NOT EXISTS size TEXT,
  ADD COLUMN IF NOT EXISTS size_uom TEXT;

-- 2. Products table (used for Accessories & Readymade Trade): add structured columns
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS brand_name TEXT,
  ADD COLUMN IF NOT EXISTS specification TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS shade_no TEXT,
  ADD COLUMN IF NOT EXISTS size_uom TEXT;

-- 3. Ensure Canvas category exists in trim_categories
INSERT INTO public.trim_categories (name, code_prefix, default_uom, is_system)
SELECT 'Canvas', 'CNV', 'Inchs', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.trim_categories WHERE UPPER(code_prefix) = 'CNV' OR LOWER(name) = 'canvas'
);

-- 4. Create indexes for quick filtering
CREATE INDEX IF NOT EXISTS idx_trims_brand_name ON public.trims(brand_name);
CREATE INDEX IF NOT EXISTS idx_trims_color ON public.trims(color);
CREATE INDEX IF NOT EXISTS idx_trims_size ON public.trims(size);

CREATE INDEX IF NOT EXISTS idx_products_brand_name ON public.products(brand_name);
CREATE INDEX IF NOT EXISTS idx_products_color ON public.products(color);
