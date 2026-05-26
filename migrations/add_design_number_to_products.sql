-- Migration: Add design_number column to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS design_number TEXT UNIQUE DEFAULT NULL;
