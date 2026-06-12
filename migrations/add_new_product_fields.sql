-- Migration: Add new fields for product specifications
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS other_sizes TEXT,
  ADD COLUMN IF NOT EXISTS other_fits TEXT,
  ADD COLUMN IF NOT EXISTS measurement_type TEXT,
  ADD COLUMN IF NOT EXISTS class_fabric_consumption JSONB DEFAULT '{}'::jsonb;
