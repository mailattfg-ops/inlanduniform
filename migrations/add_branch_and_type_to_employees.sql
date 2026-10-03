-- Migration: add_branch_and_type_to_employees.sql
-- Description: Adds branch_id foreign key, employment_type, and status columns to employees table for unified HRMS

-- 1. Add branch_id foreign key referencing branches
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL;

-- 2. Add employment_type column
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'Permanent';

-- 3. Add status column (defaults to 'Active')
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

-- 4. Add check constraint for valid employment types
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_employees_employment_type'
  ) THEN
    ALTER TABLE employees 
    ADD CONSTRAINT check_employees_employment_type 
    CHECK (employment_type IN ('Permanent', 'Temporary', 'Contract', 'Probation', 'Intern'));
  END IF;
END $$;

-- 5. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_employment_type ON employees(employment_type);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
