-- ==============================================================================
-- Migration: Drop Unused Tables
-- Target: Supabase PostgreSQL (Project: bnoisnaaqfhqeaaiizzv)
-- Date: 2026-09-30
-- Description:
-- Drops 'order_items' and 'product_variants'.
-- Audit confirmation:
-- 1. order_items: 0 rows, 0 references (orders query line items from quotation_items)
-- 2. product_variants: 0 rows, 0 references (system uses product_design_variants)
-- ==============================================================================

-- 1. Drop unused order_items table
DROP TABLE IF EXISTS public.order_items CASCADE;

-- 2. Drop unused product_variants table
DROP TABLE IF EXISTS public.product_variants CASCADE;

-- 3. Notify PostgREST schema cache to reload immediately
NOTIFY pgrst, 'reload schema';
