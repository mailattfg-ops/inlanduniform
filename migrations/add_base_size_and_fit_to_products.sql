-- Migration: Add base_size and fit columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_size TEXT DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS fit TEXT DEFAULT NULL;
