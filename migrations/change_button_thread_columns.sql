-- Migration: Drop button_id and thread_id relations and add button_count and thread_count integer columns in products table
ALTER TABLE products DROP COLUMN IF EXISTS button_id CASCADE;
ALTER TABLE products DROP COLUMN IF EXISTS thread_id CASCADE;

ALTER TABLE products ADD COLUMN IF NOT EXISTS button_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS thread_count INTEGER DEFAULT 0;
