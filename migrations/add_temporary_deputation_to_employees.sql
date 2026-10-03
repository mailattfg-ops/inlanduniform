-- Migration: add_temporary_deputation_to_employees.sql
-- Description: Adds temporary branch deputation columns to employees table

-- 1. Add temporary deputation columns
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS temp_branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS temp_branch_until DATE,
ADD COLUMN IF NOT EXISTS temp_branch_notes TEXT;

-- 2. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_employees_temp_branch_id ON employees(temp_branch_id);
