-- 1. Create Industries Table
CREATE TABLE IF NOT EXISTS industries (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed basic industries
INSERT INTO industries (name, type) 
VALUES 
    ('School', 'educational'), 
    ('Corporate', 'office'), 
    ('Healthcare', 'medical'), 
    ('Manufacturing', 'industrial'), 
    ('Hospitality', 'service')
ON CONFLICT (name) DO NOTHING;

-- 2. Rename schools to organizations
ALTER TABLE schools RENAME TO organizations;

-- 3. Add Industry ID to Organizations
-- We'll default existing organizations (schools) to the 'School' industry (ID 1)
ALTER TABLE organizations ADD COLUMN industry_id BIGINT REFERENCES industries(id);
UPDATE organizations SET industry_id = (SELECT id FROM industries WHERE name = 'School' LIMIT 1);

-- 4. Rename classes to departments
ALTER TABLE classes RENAME TO departments;

-- 5. Clean up Departments (Removing School-specific Grade/Section logic)
ALTER TABLE departments RENAME COLUMN school_id TO organization_id;
-- We keep 'grade' and 'section' for now to prevent data loss, but we add a generic 'name'
-- If 'name' is empty, we populate it from grade-section for schools
UPDATE departments SET name = grade || '-' || section WHERE name IS NULL OR name = '';

-- 6. Update Students Table (the 'Registry Members')
ALTER TABLE students RENAME TO registry_members;
ALTER TABLE registry_members RENAME COLUMN school_id TO organization_id;
ALTER TABLE registry_members RENAME COLUMN class_id TO department_id;

-- 7. Update Uniform Templates (The 'Industry Assets')
ALTER TABLE uniform_templates RENAME TO industry_templates;
ALTER TABLE industry_templates RENAME COLUMN school_id TO organization_id;
ALTER TABLE industry_templates RENAME COLUMN classes TO department_ids;

-- 9. Rename student_id to member_id in related tables
ALTER TABLE IF EXISTS measurements RENAME COLUMN student_id TO member_id;
ALTER TABLE IF EXISTS industry_templates RENAME COLUMN department_ids TO department_ids; -- already done but keeping for ref
-- (Add other tables if they exist, e.g., uniforms, orders)
ALTER TABLE IF EXISTS orders RENAME COLUMN student_id TO member_id;
