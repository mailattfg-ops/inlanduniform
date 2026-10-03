-- Migration: create_employee_work_history.sql
-- Description: Creates table to track complete branch, work, and movement history of each employee

CREATE TABLE IF NOT EXISTS employee_work_history (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT REFERENCES employees(id) ON DELETE CASCADE,
  branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  assignment_type TEXT NOT NULL DEFAULT 'Initial Placement' 
    CHECK (assignment_type IN ('Initial Placement', 'Permanent Transfer', 'Temporary Deputation', 'Recall / Returned')),
  designation TEXT,
  department TEXT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT TRUE,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for history queries
CREATE INDEX IF NOT EXISTS idx_work_history_emp_id ON employee_work_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_history_branch_id ON employee_work_history(branch_id);
CREATE INDEX IF NOT EXISTS idx_work_history_is_current ON employee_work_history(is_current);
