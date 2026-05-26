-- ================================================================
-- PENDING DATABASE MIGRATIONS
-- Run these SQL statements in your Supabase SQL Editor
-- (Project Settings > SQL Editor or Table Editor > SQL)
-- ================================================================

-- 1. Add design_number column to products table
--    This enables auto-generated DN-XXXX design numbers
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS design_number TEXT UNIQUE DEFAULT NULL;

-- ================================================================
-- All other migrations should already be applied.
-- The above is the only pending migration.
-- ================================================================
