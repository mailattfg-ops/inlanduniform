-- Add Catalog details to Group Designs schema

-- 1. Add columns to group_design_numbers
ALTER TABLE public.group_design_numbers 
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Add columns to group_design_mappings
ALTER TABLE public.group_design_mappings 
  ADD COLUMN IF NOT EXISTS remarks TEXT;
