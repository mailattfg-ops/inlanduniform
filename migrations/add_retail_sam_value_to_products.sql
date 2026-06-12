-- Migration: Add retail_sam_value column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_sam_value NUMERIC(8,4) DEFAULT NULL;

-- Description: retail_sam_value stores the Retail Standard Allowed Minutes (SAM) as a decimal/fraction
