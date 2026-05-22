-- Migration: Replace design_id with direct fabric, button, and thread columns in products table
ALTER TABLE products DROP COLUMN IF EXISTS design_id;

-- Drop the unused designs table entirely
DROP TABLE IF EXISTS designs CASCADE;

-- Add direct specifications relation columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS main_fabric_id UUID REFERENCES fabrics(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS attachment_fabric1_id UUID REFERENCES fabrics(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS attachment_fabric2_id UUID REFERENCES fabrics(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS button_id UUID REFERENCES buttons(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES threads(id) ON DELETE SET NULL;
