-- Add Catalog details to individual Design Numbers schema

-- 1. Add columns to design_numbers
ALTER TABLE public.design_numbers 
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;
