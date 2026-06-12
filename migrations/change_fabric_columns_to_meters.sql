-- Migration: Drop fabric foreign key references and add direct integer columns for meters in products table
ALTER TABLE products DROP COLUMN IF EXISTS main_fabric_id CASCADE;
ALTER TABLE products DROP COLUMN IF EXISTS attachment_fabric1_id CASCADE;
ALTER TABLE products DROP COLUMN IF EXISTS attachment_fabric2_id CASCADE;

ALTER TABLE products ADD COLUMN IF NOT EXISTS main_fabric INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS attachment_fabric1 INTEGER DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS attachment_fabric2 INTEGER DEFAULT NULL;
