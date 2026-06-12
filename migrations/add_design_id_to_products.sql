-- Migration: Add design_id to products referencing designs table
ALTER TABLE products ADD COLUMN IF NOT EXISTS design_id UUID REFERENCES designs(id) ON DELETE SET NULL;
