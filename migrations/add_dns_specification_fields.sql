-- Migration: Add full specification details to design_numbers table
-- Stores the exact recipe (ART number, fabrics, trims) associated with each generated DNS

ALTER TABLE public.design_numbers 
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS art_number TEXT,
  ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fabric_id TEXT,
  ADD COLUMN IF NOT EXISTS attachment_fabric1_id TEXT,
  ADD COLUMN IF NOT EXISTS attachment_fabric2_id TEXT,
  ADD COLUMN IF NOT EXISTS trims JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS material_combination TEXT;

-- Fast index for duplicate combination lookups
CREATE INDEX IF NOT EXISTS idx_design_numbers_combination 
  ON public.design_numbers (product_id, material_combination);

-- Fast index for lookup by ART number
CREATE INDEX IF NOT EXISTS idx_design_numbers_art_number 
  ON public.design_numbers (art_number);
