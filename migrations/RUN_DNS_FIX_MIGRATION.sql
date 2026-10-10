-- =========================================================================
-- RUN THIS IN SUPABASE SQL EDITOR TO FIX DNS SPECIFICATION & VARIANT STORAGE
-- =========================================================================

-- 1. Add full recipe & specification columns to design_numbers table
ALTER TABLE public.design_numbers 
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS art_number TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Design',
  ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fabric_id TEXT,
  ADD COLUMN IF NOT EXISTS attachment_fabric1_id TEXT,
  ADD COLUMN IF NOT EXISTS attachment_fabric2_id TEXT,
  ADD COLUMN IF NOT EXISTS trims JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS material_combination TEXT;

-- 2. Create indices on design_numbers for fast lookup
CREATE INDEX IF NOT EXISTS idx_design_numbers_combination 
  ON public.design_numbers (product_id, material_combination);

CREATE INDEX IF NOT EXISTS idx_design_numbers_art_number 
  ON public.design_numbers (art_number);

-- 3. Update product_design_variants constraint:
-- Drop old constraint that restricted only 1 variant per (product_id, button_id, thread_id)
ALTER TABLE public.product_design_variants
  DROP CONSTRAINT IF EXISTS product_design_variants_product_id_button_id_thread_id_key;

-- 4. Create unique index based on full material_combination signature
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_design_variants_signature
  ON public.product_design_variants (product_id, material_combination)
  WHERE material_combination IS NOT NULL;

-- 5. Ensure quotation_items has all required cost, product_type, and breakdown columns
ALTER TABLE public.quotation_items
  ADD COLUMN IF NOT EXISTS product_type_id BIGINT,
  ADD COLUMN IF NOT EXISTS fabric_cost_per_item NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS accessories_cost_per_item NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS labor_cost_per_item NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS size_breakdown JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_item_name TEXT;

