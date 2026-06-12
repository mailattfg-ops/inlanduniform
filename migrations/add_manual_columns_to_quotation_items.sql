-- Migration: Add fabric_id, sam_value, design_number to quotation_items
ALTER TABLE public.quotation_items
  ADD COLUMN IF NOT EXISTS fabric_id UUID REFERENCES public.fabrics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sam_value NUMERIC(8,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS design_number TEXT DEFAULT NULL;
