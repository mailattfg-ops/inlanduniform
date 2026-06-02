-- Migration: Add product_type to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type TEXT;
