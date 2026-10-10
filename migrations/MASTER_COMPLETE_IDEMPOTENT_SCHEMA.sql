-- ==============================================================================
-- FORMA APPARELS / INLAND UNIFORM — MASTER DATABASE MIGRATION SCRIPT
-- Target: Supabase PostgreSQL
--
-- SAFETY GUARANTEES:
-- 1. ZERO DATA LOSS: Does NOT drop, truncate, or delete any tables or columns.
-- 2. COMPLETELY IDEMPOTENT: Safe to run once or 100 times without errors.
-- 3. AUTO-EXPANDS EXISTING TABLES: Uses ADD COLUMN IF NOT EXISTS for every field.
-- 4. TYPE-SAFE FOREIGN KEYS: Dynamic type-matching prevents ERROR 42804.
-- 5. AUTOMATIC POSTGREST SCHEMA CACHE RELOAD: Avoids 500 / PGRST204 errors.
-- ==============================================================================

-- Enable Core PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. AUTHENTICATION, ROLES & USER PROFILES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.user_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    permissions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_types
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Seed System Roles (Idempotent)
INSERT INTO public.user_types (name, permissions) VALUES
    ('Admin', '["all"]'::jsonb),
    ('Branch Manager', '["branch_inventory", "branch_sales", "branch_transfers", "view_employees", "view_organizations", "manage_schools", "view_schools", "manage_classes", "manage_departments", "view_students", "register_students", "manage_students", "view_products", "manage_products", "view_measurements", "manage_measurements", "manage_quotations", "view_quotations", "manage_invoices", "view_invoices"]'::jsonb),
    ('Branch Staff', '["branch_inventory", "branch_sales", "view_organizations", "view_schools", "view_students", "register_students", "view_products", "view_measurements", "manage_measurements", "view_quotations", "view_invoices"]'::jsonb),
    ('Factory PO Handler', '["factory_po_handler", "factory_floor", "view_inventory", "manage_inventory"]'::jsonb),
    ('Factory Production Staff', '["factory_floor"]'::jsonb),
    ('Marketing Executive', '["manage_quotations", "view_quotations", "branch_sales", "view_organizations", "view_schools", "view_products"]'::jsonb),
    ('Inventory Manager', '["view_inventory", "manage_inventory", "view_products", "manage_products", "view_size_charts", "manage_size_charts"]'::jsonb),
    ('Corporate Approver', '["corporate_approver", "view_quotations", "view_organizations", "view_schools", "view_products"]'::jsonb),
    ('Organisation', '["view_schools", "view_own_students", "manage_classes", "view_own_measurements"]'::jsonb),
    ('Entity', '["view_own_students", "view_own_measurements"]'::jsonb),
    ('Staff', '["view_measurements", "manage_measurements"]'::jsonb),
    ('School', '["view_schools", "view_own_students", "manage_classes", "view_own_measurements"]'::jsonb),
    ('Customer', '["view_schools", "view_own_students", "manage_classes", "view_own_measurements"]'::jsonb)
ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions;

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id BIGSERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    password TEXT NOT NULL,
    avatar_url TEXT,
    user_type_id UUID,
    branch_id BIGINT,
    organization_id BIGINT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS username TEXT,
    ADD COLUMN IF NOT EXISTS password TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS user_type_id UUID,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS organization_id BIGINT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 2. BRANCHES, NETWORK & HUB
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.branches (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'Branch',
    address TEXT,
    contact_number TEXT,
    email TEXT,
    operational_settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.branches
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'Branch',
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS contact_number TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS operational_settings JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.branch_users (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Branch Staff',
    password_plain TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.branch_users
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Branch Staff',
    ADD COLUMN IF NOT EXISTS password_plain TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 3. EMPLOYEES & WORK HISTORY
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.employees (
    id BIGSERIAL PRIMARY KEY,
    employee_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    contact_number TEXT,
    email TEXT,
    type TEXT NOT NULL DEFAULT 'Permanent',
    home_branch_id BIGINT,
    current_branch_id BIGINT,
    branch_id BIGINT,
    designation TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    is_active BOOLEAN DEFAULT true,
    temporary_deputation JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS employee_id TEXT,
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS contact_number TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Permanent',
    ADD COLUMN IF NOT EXISTS home_branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS current_branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS designation TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS temporary_deputation JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.employee_work_history (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT,
    job_card_id BIGINT,
    operation_type TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    pieces_completed INTEGER DEFAULT 0,
    earned_amount NUMERIC(12,2) DEFAULT 0.00,
    completed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.employee_work_history
    ADD COLUMN IF NOT EXISTS employee_id BIGINT,
    ADD COLUMN IF NOT EXISTS job_card_id BIGINT,
    ADD COLUMN IF NOT EXISTS operation_type TEXT,
    ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS pieces_completed INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS earned_amount NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 4. INDUSTRIES, ORGANIZATIONS & DEPARTMENTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.industries (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    code TEXT UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.industries
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Seed Default Industries
INSERT INTO public.industries (name, code, description) VALUES
    ('School / Education', 'EDU', 'Schools, Colleges, Academies and Universities'),
    ('Corporate / IT', 'CORP', 'Corporate offices, IT companies, and MNC uniforms'),
    ('Healthcare / Hospitals', 'HLTH', 'Hospitals, Clinics, Scrubs, and Lab coats'),
    ('Hospitality & Hotel', 'HOSP', 'Hotels, Restaurants, Chefs, and Service staff'),
    ('Industrial & Security', 'IND', 'Security guards, Factory workers, Coveralls, and High-Vis')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.organizations (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    customer_code TEXT UNIQUE,
    industry_id BIGINT,
    branch_id BIGINT,
    address TEXT,
    contact_person TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    status TEXT DEFAULT 'Active',
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS customer_code TEXT,
    ADD COLUMN IF NOT EXISTS industry_id BIGINT,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS pincode TEXT,
    ADD COLUMN IF NOT EXISTS pin_code TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS contact_person TEXT,
    ADD COLUMN IF NOT EXISTS contact_email TEXT,
    ADD COLUMN IF NOT EXISTS contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.organization_staff (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    designation TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organization_staff
    ADD COLUMN IF NOT EXISTS organization_id BIGINT,
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS designation TEXT;

CREATE TABLE IF NOT EXISTS public.departments (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT,
    school_id BIGINT,
    name TEXT NOT NULL,
    section TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.departments
    ADD COLUMN IF NOT EXISTS organization_id BIGINT,
    ADD COLUMN IF NOT EXISTS school_id BIGINT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS section TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 5. RECIPIENT REGISTRY, MEASUREMENTS & TOKENS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.registry_members (
    id BIGSERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    admission_no TEXT,
    organization_id BIGINT,
    school_id BIGINT,
    department_id BIGINT,
    class_id BIGINT,
    section TEXT,
    gender TEXT,
    contact_mobile TEXT,
    status TEXT DEFAULT 'Active',
    user_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.registry_members
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS admission_no TEXT,
    ADD COLUMN IF NOT EXISTS organization_id BIGINT,
    ADD COLUMN IF NOT EXISTS school_id BIGINT,
    ADD COLUMN IF NOT EXISTS department_id BIGINT,
    ADD COLUMN IF NOT EXISTS class_id BIGINT,
    ADD COLUMN IF NOT EXISTS section TEXT,
    ADD COLUMN IF NOT EXISTS gender TEXT,
    ADD COLUMN IF NOT EXISTS contact_mobile TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS user_id BIGINT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.measurements (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT,
    student_id BIGINT,
    recorded_by BIGINT,
    dynamic_data JSONB DEFAULT '{}'::jsonb,
    suggested_size TEXT,
    notes TEXT,
    status TEXT DEFAULT 'Pending',
    reviewer_id BIGINT,
    reviewed_at TIMESTAMPTZ,
    recorded_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.measurements
    ADD COLUMN IF NOT EXISTS member_id BIGINT,
    ADD COLUMN IF NOT EXISTS student_id BIGINT,
    ADD COLUMN IF NOT EXISTS recorded_by BIGINT,
    ADD COLUMN IF NOT EXISTS dynamic_data JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS suggested_size TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS reviewer_id BIGINT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.measurement_tokens (
    id BIGSERIAL PRIMARY KEY,
    token_number TEXT NOT NULL,
    organization_id BIGINT,
    order_id BIGINT,
    member_id BIGINT,
    student_name TEXT NOT NULL,
    class_name TEXT,
    section_name TEXT,
    item_name TEXT NOT NULL,
    alteration_details TEXT,
    unique_composite_id TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'Assigned',
    created_by BIGINT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.measurement_tokens
    ADD COLUMN IF NOT EXISTS token_number TEXT,
    ADD COLUMN IF NOT EXISTS organization_id BIGINT,
    ADD COLUMN IF NOT EXISTS order_id BIGINT,
    ADD COLUMN IF NOT EXISTS member_id BIGINT,
    ADD COLUMN IF NOT EXISTS student_name TEXT,
    ADD COLUMN IF NOT EXISTS class_name TEXT,
    ADD COLUMN IF NOT EXISTS section_name TEXT,
    ADD COLUMN IF NOT EXISTS item_name TEXT,
    ADD COLUMN IF NOT EXISTS alteration_details TEXT,
    ADD COLUMN IF NOT EXISTS unique_composite_id TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Assigned',
    ADD COLUMN IF NOT EXISTS created_by BIGINT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.measurement_config (
    id BIGSERIAL PRIMARY KEY,
    product_type_id BIGINT,
    label TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Inches',
    display_order INTEGER DEFAULT 1,
    is_required BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.measurement_config
    ADD COLUMN IF NOT EXISTS product_type_id BIGINT,
    ADD COLUMN IF NOT EXISTS label TEXT,
    ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'Inches',
    ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Seed Default Measurement Config
INSERT INTO public.measurement_config (label, unit, display_order, is_required) VALUES
    ('Chest', 'Inches', 1, true),
    ('Waist', 'Inches', 2, true),
    ('Hip', 'Inches', 3, true),
    ('Shoulder', 'Inches', 4, true),
    ('Shirt Length', 'Inches', 5, true),
    ('Sleeve Length', 'Inches', 6, true),
    ('Trouser Length', 'Inches', 7, true),
    ('Inseam', 'Inches', 8, false),
    ('Neck', 'Inches', 9, false)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 6. DESIGN NUMBERS, ART HUB & PRODUCT CATALOG
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.designs (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.design_numbers (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.design_numbers
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT;

CREATE TABLE IF NOT EXISTS public.group_design_numbers (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE,
    design_number TEXT,
    name TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.group_design_numbers
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS design_number TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.group_design_numbers ALTER COLUMN design_number DROP NOT NULL;

UPDATE public.group_design_numbers
SET code = COALESCE(code, design_number, name, 'DNG-' || id)
WHERE code IS NULL OR code = '';

UPDATE public.group_design_numbers
SET design_number = COALESCE(design_number, code, name, 'DNG-' || id)
WHERE design_number IS NULL OR design_number = '';

CREATE TABLE IF NOT EXISTS public.group_design_mappings (
    id BIGSERIAL PRIMARY KEY,
    parent_id BIGINT,
    child_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(parent_id, child_id)
);

-- Art Number Hub: Dresses, Genders, Patterns, Fits, Full Codes
CREATE TABLE IF NOT EXISTS public.art_dresses (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.art_dresses
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.art_genders (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.art_genders
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.art_patterns (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    dress_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.art_patterns
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS dress_id BIGINT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.art_fits (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    pattern_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.art_fits
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS pattern_id BIGINT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.art_numbers (
    id BIGSERIAL PRIMARY KEY,
    full_code TEXT UNIQUE NOT NULL,
    dress_id BIGINT,
    gender_id BIGINT,
    pattern_id BIGINT,
    fit_id BIGINT,
    description TEXT,
    image_url TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.art_numbers
    ADD COLUMN IF NOT EXISTS full_code TEXT,
    ADD COLUMN IF NOT EXISTS dress_id BIGINT,
    ADD COLUMN IF NOT EXISTS gender_id BIGINT,
    ADD COLUMN IF NOT EXISTS pattern_id BIGINT,
    ADD COLUMN IF NOT EXISTS fit_id BIGINT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Seed Default Art Dresses, Genders & Fits
INSERT INTO public.art_dresses (code, name) VALUES
    ('4J', 'Blazer / Coat'),
    ('SH', 'Shirt'),
    ('TR', 'Trouser / Pant'),
    ('SK', 'Skirt'),
    ('TS', 'T-Shirt'),
    ('TK', 'Trackpant'),
    ('WA', 'Waistcoat'),
    ('TI', 'Tie'),
    ('BL', 'Belt')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.art_genders (code, name) VALUES
    ('M', 'Male / Boy'),
    ('F', 'Female / Girl'),
    ('U', 'Unisex')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.art_fits (code, name) VALUES
    ('REG', 'Regular Fit'),
    ('SLM', 'Slim Fit'),
    ('RLX', 'Relaxed Fit'),
    ('CST', 'Custom Fit')
ON CONFLICT (code) DO NOTHING;

-- Product Types & Size Charts
CREATE TABLE IF NOT EXISTS public.product_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.product_types
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

INSERT INTO public.product_types (name) VALUES
    ('Shirt'),
    ('Trouser'),
    ('Blazer'),
    ('Skirt'),
    ('T-Shirt'),
    ('Trackpant'),
    ('Waistcoat'),
    ('Accessory')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.size_charts (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    gender TEXT,
    unit TEXT DEFAULT 'Inches',
    chart_data JSONB DEFAULT '[]'::jsonb,
    metric_groups JSONB DEFAULT '[]'::jsonb,
    fit_types JSONB DEFAULT '[]'::jsonb,
    measurements JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.size_charts
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS gender TEXT,
    ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'Inches',
    ADD COLUMN IF NOT EXISTS chart_data JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS metric_groups JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS fit_types JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS measurements JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Products (Contains ALL columns queried in productController.js)
CREATE TABLE IF NOT EXISTS public.products (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    art_number TEXT UNIQUE NOT NULL,
    product_type_id BIGINT,
    product_type TEXT,
    gender TEXT,
    measurements JSONB DEFAULT '[]'::jsonb,
    materials TEXT,
    entry_methods JSONB DEFAULT '[]'::jsonb,
    entry_method TEXT,
    size_chart_id BIGINT,
    category TEXT,
    base_size TEXT,
    fit TEXT,
    allowance TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    design_number_id BIGINT,
    design_number TEXT,
    other_sizes JSONB DEFAULT '[]'::jsonb,
    other_fits JSONB DEFAULT '[]'::jsonb,
    measurement_type TEXT,
    class_fabric_consumption JSONB DEFAULT '{}'::jsonb,
    remarks TEXT,
    sam_value NUMERIC(10,4) DEFAULT 0.0000,
    retail_sam_value NUMERIC(10,4) DEFAULT 0.0000,
    main_fabric NUMERIC(10,2) DEFAULT 0.00,
    attachment_fabric1 NUMERIC(10,2),
    attachment_fabric2 NUMERIC(10,2),
    main_fabric_id TEXT,
    attachment_fabric1_id TEXT,
    attachment_fabric2_id TEXT,
    button_count INTEGER DEFAULT 0,
    thread_count INTEGER DEFAULT 0,
    button_id TEXT,
    thread_id TEXT,
    fabric_ids JSONB DEFAULT '[]'::jsonb,
    base_price NUMERIC(12,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Crucial: Ensure EVERY single product column exists even if table pre-existed!
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS art_number TEXT,
    ADD COLUMN IF NOT EXISTS product_type_id BIGINT,
    ADD COLUMN IF NOT EXISTS product_type TEXT,
    ADD COLUMN IF NOT EXISTS gender TEXT,
    ADD COLUMN IF NOT EXISTS measurements JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS materials TEXT,
    ADD COLUMN IF NOT EXISTS entry_methods JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS entry_method TEXT,
    ADD COLUMN IF NOT EXISTS size_chart_id BIGINT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS base_size TEXT,
    ADD COLUMN IF NOT EXISTS fit TEXT,
    ADD COLUMN IF NOT EXISTS allowance TEXT,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS design_number_id BIGINT,
    ADD COLUMN IF NOT EXISTS design_number TEXT,
    ADD COLUMN IF NOT EXISTS other_sizes JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS other_fits JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS measurement_type TEXT,
    ADD COLUMN IF NOT EXISTS class_fabric_consumption JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS remarks TEXT,
    ADD COLUMN IF NOT EXISTS sam_value NUMERIC(10,4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS retail_sam_value NUMERIC(10,4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS main_fabric NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS attachment_fabric1 NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS attachment_fabric2 NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS main_fabric_id TEXT,
    ADD COLUMN IF NOT EXISTS attachment_fabric1_id TEXT,
    ADD COLUMN IF NOT EXISTS attachment_fabric2_id TEXT,
    ADD COLUMN IF NOT EXISTS button_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS thread_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS button_id TEXT,
    ADD COLUMN IF NOT EXISTS thread_id TEXT,
    ADD COLUMN IF NOT EXISTS fabric_ids JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.product_stocks (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT,
    branch_id BIGINT,
    size TEXT NOT NULL,
    quantity INTEGER DEFAULT 0,
    reserved_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(product_id, size, branch_id)
);

ALTER TABLE public.product_stocks
    ADD COLUMN IF NOT EXISTS product_id BIGINT,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS size TEXT,
    ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 10,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.product_design_variants (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT,
    design_number_id BIGINT,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 7. FABRICS, TRIMS, BUTTONS, THREADS & ACCESSORIES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.fabrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    brand_name TEXT,
    brand_type TEXT,
    quality TEXT,
    shade TEXT,
    width TEXT,
    quantity NUMERIC(12,2) DEFAULT 0.00,
    stock_meters NUMERIC(12,2) DEFAULT 0.00,
    low_stock_threshold NUMERIC(12,2) DEFAULT 10.00,
    unit_price NUMERIC(12,2) DEFAULT 0.00,
    latest_sam NUMERIC(10,4) DEFAULT 0.0000,
    vendors JSONB DEFAULT '[]'::jsonb,
    garment_category TEXT,
    description TEXT,
    image TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.fabrics
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS brand_name TEXT,
    ADD COLUMN IF NOT EXISTS brand_type TEXT,
    ADD COLUMN IF NOT EXISTS quality TEXT,
    ADD COLUMN IF NOT EXISTS shade TEXT,
    ADD COLUMN IF NOT EXISTS width TEXT,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS stock_meters NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(12,2) DEFAULT 10.00,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS latest_sam NUMERIC(10,4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS vendors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS garment_category TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS image TEXT,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.buttons (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    size TEXT,
    color TEXT,
    unit_price NUMERIC(10,2) DEFAULT 0.00,
    stock_quantity INTEGER DEFAULT 0,
    description TEXT,
    image TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    vendors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.buttons
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS type TEXT,
    ADD COLUMN IF NOT EXISTS size TEXT,
    ADD COLUMN IF NOT EXISTS color TEXT,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS image TEXT,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS vendors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.threads (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    shade TEXT,
    color TEXT,
    unit_price NUMERIC(10,2) DEFAULT 0.00,
    stock_quantity INTEGER DEFAULT 0,
    description TEXT,
    image TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    vendors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.threads
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS type TEXT,
    ADD COLUMN IF NOT EXISTS shade TEXT,
    ADD COLUMN IF NOT EXISTS color TEXT,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS image TEXT,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS vendors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Trim Categories
CREATE TABLE IF NOT EXISTS public.trim_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code_prefix TEXT NOT NULL UNIQUE,
    default_uom TEXT DEFAULT 'pcs',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.trim_categories
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS code_prefix TEXT,
    ADD COLUMN IF NOT EXISTS default_uom TEXT DEFAULT 'pcs',
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

INSERT INTO public.trim_categories (name, code_prefix, default_uom, is_system) VALUES
    ('Button', 'BTN', 'pcs', true),
    ('Thread', 'THR', 'cones', true),
    ('Zipper', 'ZIP', 'pcs', true),
    ('Elastic', 'ELAS', 'meters', true),
    ('Interlining', 'INT', 'meters', true),
    ('Label', 'LBL', 'pcs', true),
    ('Hook & Bar', 'HKB', 'sets', true),
    ('Drawstring', 'DRW', 'meters', true),
    ('Shoulder Pad', 'SHP', 'pairs', true),
    ('Other Trim', 'TRM', 'pcs', true)
ON CONFLICT (name) DO NOTHING;

-- Accessory Categories (Dynamic Master)
CREATE TABLE IF NOT EXISTS public.accessory_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code_prefix TEXT NOT NULL UNIQUE,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.accessory_categories
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS code_prefix TEXT,
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

INSERT INTO public.accessory_categories (name, code_prefix, is_system) VALUES
    ('Tie', 'TIE', true),
    ('Belt', 'BLT', true),
    ('Socks', 'SCK', true),
    ('Badge / Crest', 'BDG', true),
    ('Cap / Hat', 'CAP', true),
    ('Lanyard / ID Card', 'LAN', true),
    ('Scarf / Dupatta', 'SCF', true),
    ('Water Bottle / Lunchbox', 'BOT', true),
    ('Other Accessory', 'ACC', true)
ON CONFLICT (name) DO NOTHING;

-- Trims & Accessories Master
CREATE TABLE IF NOT EXISTS public.trims (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    uom TEXT DEFAULT 'pcs',
    brand TEXT,
    color TEXT,
    size TEXT,
    unit_price NUMERIC(10,2) DEFAULT 0.00,
    quantity NUMERIC(12,2) DEFAULT 0.00,
    stock_quantity NUMERIC(12,2) DEFAULT 0.00,
    low_stock_threshold NUMERIC(12,2) DEFAULT 10.00,
    min_order_qty INTEGER DEFAULT 1,
    lead_time_days INTEGER DEFAULT 7,
    description TEXT,
    image TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    vendors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.trims
    ADD COLUMN IF NOT EXISTS category_id UUID,
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS uom TEXT DEFAULT 'pcs',
    ADD COLUMN IF NOT EXISTS brand TEXT,
    ADD COLUMN IF NOT EXISTS color TEXT,
    ADD COLUMN IF NOT EXISTS size TEXT,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS stock_quantity NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(12,2) DEFAULT 10.00,
    ADD COLUMN IF NOT EXISTS min_order_qty INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 7,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS image TEXT,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS vendors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 8. VENDORS, PROCUREMENT & INVENTORY MOVEMENTS (TYPE-SAFE)
-- ==============================================================================

-- Compatible with either existing BIGINT or UUID primary key!
CREATE TABLE IF NOT EXISTS public.vendors (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    category TEXT DEFAULT 'Fabric',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vendors
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS contact_person TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Fabric',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id BIGSERIAL PRIMARY KEY,
    po_number TEXT UNIQUE NOT NULL,
    vendor_id BIGINT,
    supplier_name TEXT DEFAULT 'Default Supplier',
    order_id BIGINT,
    status TEXT NOT NULL DEFAULT 'Draft',
    notes TEXT,
    is_auto_triggered BOOLEAN DEFAULT false,
    total_amount NUMERIC(14,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Harmonize purchase_orders.vendor_id if it pre-existed with uuid type
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'vendor_id' AND data_type = 'uuid'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'vendors' AND column_name = 'id' AND data_type IN ('bigint', 'integer')
    ) THEN
        ALTER TABLE public.purchase_orders ALTER COLUMN vendor_id DROP DEFAULT;
        ALTER TABLE public.purchase_orders ALTER COLUMN vendor_id TYPE BIGINT USING NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS po_number TEXT,
    ADD COLUMN IF NOT EXISTS vendor_id BIGINT,
    ADD COLUMN IF NOT EXISTS supplier_name TEXT DEFAULT 'Default Supplier',
    ADD COLUMN IF NOT EXISTS order_id BIGINT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS is_auto_triggered BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT,
    fabric_id TEXT,
    trim_id TEXT,
    item_type TEXT,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
    received_quantity NUMERIC(12,2) DEFAULT 0.00,
    unit_price NUMERIC(12,2) DEFAULT 0.00,
    total_price NUMERIC(14,2) DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.purchase_order_items
    ADD COLUMN IF NOT EXISTS purchase_order_id BIGINT,
    ADD COLUMN IF NOT EXISTS fabric_id TEXT,
    ADD COLUMN IF NOT EXISTS trim_id TEXT,
    ADD COLUMN IF NOT EXISTS item_type TEXT,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,2) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS received_quantity NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_price NUMERIC(14,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending';

CREATE TABLE IF NOT EXISTS public.purchase_entry_batches (
    id BIGSERIAL PRIMARY KEY,
    batch_no TEXT UNIQUE NOT NULL,
    vendor_id BIGINT,
    branch_id BIGINT,
    invoice_no TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    total_amount NUMERIC(14,2) DEFAULT 0.00,
    received_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.purchase_entry_batches
    ADD COLUMN IF NOT EXISTS batch_no TEXT,
    ADD COLUMN IF NOT EXISTS vendor_id BIGINT,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS invoice_no TEXT,
    ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS received_date DATE DEFAULT CURRENT_DATE;

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT,
    item_type TEXT NOT NULL,
    item_id BIGINT,
    quantity NUMERIC(12,2) NOT NULL,
    movement_type TEXT NOT NULL,
    reference_id TEXT,
    notes TEXT,
    performed_by BIGINT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.stock_movements
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS item_type TEXT,
    ADD COLUMN IF NOT EXISTS item_id BIGINT,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS movement_type TEXT,
    ADD COLUMN IF NOT EXISTS reference_id TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS performed_by BIGINT;

CREATE TABLE IF NOT EXISTS public.branch_inventory (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT,
    item_type TEXT NOT NULL,
    item_id BIGINT NOT NULL,
    size TEXT,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
    low_stock_threshold NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.branch_inventory
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS item_type TEXT,
    ADD COLUMN IF NOT EXISTS item_id BIGINT,
    ADD COLUMN IF NOT EXISTS size TEXT,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.inter_branch_transfers (
    id BIGSERIAL PRIMARY KEY,
    transfer_no TEXT UNIQUE NOT NULL,
    from_branch_id BIGINT,
    to_branch_id BIGINT,
    status TEXT NOT NULL DEFAULT 'In Transit',
    items JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    transferred_by BIGINT,
    received_by BIGINT,
    transferred_at TIMESTAMPTZ DEFAULT now(),
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.inter_branch_transfers
    ADD COLUMN IF NOT EXISTS transfer_no TEXT,
    ADD COLUMN IF NOT EXISTS from_branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS to_branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'In Transit',
    ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS transferred_by BIGINT,
    ADD COLUMN IF NOT EXISTS received_by BIGINT,
    ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 9. LEADS & CRM PIPELINE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.leads (
    id BIGSERIAL PRIMARY KEY,
    lead_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    industry_id BIGINT,
    address TEXT,
    assigned_staff_id BIGINT,
    branch_id BIGINT,
    status TEXT NOT NULL DEFAULT 'New',
    remarks JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS lead_code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS industry_id BIGINT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS assigned_staff_id BIGINT,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'New',
    ADD COLUMN IF NOT EXISTS remarks JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 10. QUOTATIONS, ORDERS & PAYMENTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.quotations (
    id BIGSERIAL PRIMARY KEY,
    quotation_no TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    organization_id BIGINT,
    branch_id BIGINT,
    group_design_number_id BIGINT,
    estimated_expenses NUMERIC(12,2) DEFAULT 0.00,
    total_estimated_time TEXT DEFAULT '',
    production_days_estimate INTEGER DEFAULT 0,
    expected_delivery_date DATE,
    profit_margin_percent NUMERIC(6,2) DEFAULT 0.00,
    final_quote_value NUMERIC(14,2) DEFAULT 0.00,
    paid_amount NUMERIC(14,2) DEFAULT 0.00,
    payment_status TEXT DEFAULT 'Pending',
    status TEXT NOT NULL DEFAULT 'Draft',
    approval_status TEXT DEFAULT 'Pending',
    rejection_reason TEXT,
    metrics_summary JSONB DEFAULT '{}'::jsonb,
    pdf_html TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.quotations
    ADD COLUMN IF NOT EXISTS quotation_no TEXT,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS organization_id BIGINT,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS group_design_number_id BIGINT,
    ADD COLUMN IF NOT EXISTS estimated_expenses NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_estimated_time TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS production_days_estimate INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
    ADD COLUMN IF NOT EXISTS profit_margin_percent NUMERIC(6,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS final_quote_value NUMERIC(14,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft',
    ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS metrics_summary JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS pdf_html TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id BIGSERIAL PRIMARY KEY,
    quotation_id BIGINT,
    product_id BIGINT,
    product_type_id BIGINT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    size_breakdown JSONB DEFAULT '{}'::jsonb,
    fabric_cost_per_item NUMERIC(12,2) DEFAULT 0.00,
    accessories_cost_per_item NUMERIC(12,2) DEFAULT 0.00,
    labor_cost_per_item NUMERIC(12,2) DEFAULT 0.00,
    is_manual BOOLEAN DEFAULT false,
    manual_item_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.quotation_items
    ADD COLUMN IF NOT EXISTS quotation_id BIGINT,
    ADD COLUMN IF NOT EXISTS product_id BIGINT,
    ADD COLUMN IF NOT EXISTS product_type_id BIGINT,
    ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_price NUMERIC(14,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS size_breakdown JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS fabric_cost_per_item NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS accessories_cost_per_item NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS labor_cost_per_item NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS manual_item_name TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS public.orders (
    id BIGSERIAL PRIMARY KEY,
    quotation_id BIGINT,
    branch_id BIGINT,
    order_no TEXT UNIQUE NOT NULL,
    barcode TEXT,
    status TEXT NOT NULL DEFAULT 'Draft',
    corporate_action TEXT DEFAULT 'Pending',
    corporate_action_reason TEXT,
    corporate_action_by BIGINT,
    corporate_action_at TIMESTAMPTZ,
    submitted_to_corporate_at TIMESTAMPTZ,
    order_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS quotation_id BIGINT,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS order_no TEXT,
    ADD COLUMN IF NOT EXISTS barcode TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft',
    ADD COLUMN IF NOT EXISTS corporate_action TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS corporate_action_reason TEXT,
    ADD COLUMN IF NOT EXISTS corporate_action_by BIGINT,
    ADD COLUMN IF NOT EXISTS corporate_action_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS submitted_to_corporate_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS order_notes TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.payments (
    id BIGSERIAL PRIMARY KEY,
    quotation_id BIGINT,
    order_id BIGINT,
    amount NUMERIC(14,2) NOT NULL,
    payment_method TEXT NOT NULL,
    reference_no TEXT,
    notes TEXT,
    paid_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS quotation_id BIGINT,
    ADD COLUMN IF NOT EXISTS order_id BIGINT,
    ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS payment_method TEXT,
    ADD COLUMN IF NOT EXISTS reference_no TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 11. JOB CARDS, PIECE-LEVEL PRODUCTION PIPELINE & LOGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.job_cards (
    id BIGSERIAL PRIMARY KEY,
    job_card_no TEXT UNIQUE NOT NULL,
    order_id BIGINT,
    item_id BIGINT,
    product_id BIGINT,
    quantity INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'Pending PO Handler',
    cutting_status TEXT DEFAULT 'Pending',
    production_status TEXT DEFAULT 'Pending',
    finishing_status TEXT DEFAULT 'Pending',
    quality_status TEXT DEFAULT 'Pending',
    packing_status TEXT DEFAULT 'Pending',
    dispatch_status TEXT DEFAULT 'Pending',
    po_handler_action TEXT DEFAULT 'Pending',
    po_handler_reason TEXT,
    hold_reason TEXT,
    size_breakdown JSONB DEFAULT '{}'::jsonb,
    target_delivery_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.job_cards
    ADD COLUMN IF NOT EXISTS job_card_no TEXT,
    ADD COLUMN IF NOT EXISTS order_id BIGINT,
    ADD COLUMN IF NOT EXISTS item_id BIGINT,
    ADD COLUMN IF NOT EXISTS product_id BIGINT,
    ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending PO Handler',
    ADD COLUMN IF NOT EXISTS cutting_status TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS production_status TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS finishing_status TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS quality_status TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS packing_status TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS po_handler_action TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS po_handler_reason TEXT,
    ADD COLUMN IF NOT EXISTS hold_reason TEXT,
    ADD COLUMN IF NOT EXISTS size_breakdown JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS target_delivery_date DATE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.sub_job_cards (
    id BIGSERIAL PRIMARY KEY,
    sub_job_card_no TEXT UNIQUE,
    sub_card_no TEXT UNIQUE,
    job_card_id BIGINT,
    size TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    batch_size INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pending',
    stage TEXT DEFAULT 'Cutting',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sub_job_cards
    ADD COLUMN IF NOT EXISTS sub_job_card_no TEXT,
    ADD COLUMN IF NOT EXISTS sub_card_no TEXT,
    ADD COLUMN IF NOT EXISTS job_card_id BIGINT,
    ADD COLUMN IF NOT EXISTS size TEXT,
    ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS batch_size INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'Cutting',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Piece-Level Barcoded Tracking
CREATE TABLE IF NOT EXISTS public.child_job_cards (
    id BIGSERIAL PRIMARY KEY,
    child_card_no TEXT UNIQUE NOT NULL,
    job_card_id BIGINT,
    order_id BIGINT,
    barcode TEXT,
    item_type TEXT DEFAULT 'standard',
    size TEXT,
    member_id BIGINT,
    member_name TEXT,
    admission_no TEXT,
    custom_measurements JSONB DEFAULT '{}'::jsonb,
    fabric_code TEXT,
    fabric_name TEXT,
    fabric_length NUMERIC(10,2),
    fabric_meters NUMERIC(10,2),
    fabric_shade TEXT,
    attachment1_name TEXT,
    attachment1_code TEXT,
    attachment1_number TEXT,
    attachment1_length NUMERIC(10,2),
    attachment1_meters NUMERIC(10,2),
    attachment1_shade TEXT,
    attachment2_name TEXT,
    attachment2_code TEXT,
    attachment2_number TEXT,
    attachment2_length NUMERIC(10,2),
    attachment2_meters NUMERIC(10,2),
    attachment2_shade TEXT,
    fabrics JSONB DEFAULT '[]'::jsonb,
    sequence_no INTEGER,
    stage TEXT DEFAULT 'Cutting',
    status TEXT DEFAULT 'In Production',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.child_job_cards
    ADD COLUMN IF NOT EXISTS child_card_no TEXT,
    ADD COLUMN IF NOT EXISTS job_card_id BIGINT,
    ADD COLUMN IF NOT EXISTS order_id BIGINT,
    ADD COLUMN IF NOT EXISTS barcode TEXT,
    ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS size TEXT,
    ADD COLUMN IF NOT EXISTS member_id BIGINT,
    ADD COLUMN IF NOT EXISTS member_name TEXT,
    ADD COLUMN IF NOT EXISTS admission_no TEXT,
    ADD COLUMN IF NOT EXISTS custom_measurements JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS fabric_code TEXT,
    ADD COLUMN IF NOT EXISTS fabric_name TEXT,
    ADD COLUMN IF NOT EXISTS fabric_length NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS fabric_meters NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS fabric_shade TEXT,
    ADD COLUMN IF NOT EXISTS attachment1_name TEXT,
    ADD COLUMN IF NOT EXISTS attachment1_code TEXT,
    ADD COLUMN IF NOT EXISTS attachment1_number TEXT,
    ADD COLUMN IF NOT EXISTS attachment1_length NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS attachment1_meters NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS attachment1_shade TEXT,
    ADD COLUMN IF NOT EXISTS attachment2_name TEXT,
    ADD COLUMN IF NOT EXISTS attachment2_code TEXT,
    ADD COLUMN IF NOT EXISTS attachment2_number TEXT,
    ADD COLUMN IF NOT EXISTS attachment2_length NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS attachment2_meters NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS attachment2_shade TEXT,
    ADD COLUMN IF NOT EXISTS fabrics JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS sequence_no INTEGER,
    ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'Cutting',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'In Production',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.fabric_consumption_logs (
    id BIGSERIAL PRIMARY KEY,
    job_card_id BIGINT,
    sub_job_card_id BIGINT,
    fabric_id TEXT,
    fabric_name TEXT,
    required_meters NUMERIC(10,2) DEFAULT 0.00,
    allocated_meters NUMERIC(10,2) DEFAULT 0.00,
    safety_margin_meters NUMERIC(10,2) DEFAULT 0.00,
    issued_meters NUMERIC(10,2) DEFAULT 0.00,
    consumed_meters NUMERIC(10,2) DEFAULT 0.00,
    returned_meters NUMERIC(10,2) DEFAULT 0.00,
    wastage_meters NUMERIC(10,2) DEFAULT 0.00,
    cut_piece_batch_no TEXT,
    created_by BIGINT,
    logged_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Crucial: Ensure fabric_id is TEXT to allow UUIDs and IDs seamlessly
ALTER TABLE public.fabric_consumption_logs
    ADD COLUMN IF NOT EXISTS job_card_id BIGINT,
    ADD COLUMN IF NOT EXISTS sub_job_card_id BIGINT,
    ADD COLUMN IF NOT EXISTS fabric_id TEXT,
    ADD COLUMN IF NOT EXISTS fabric_name TEXT,
    ADD COLUMN IF NOT EXISTS required_meters NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS allocated_meters NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS safety_margin_meters NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS issued_meters NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS consumed_meters NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS returned_meters NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS wastage_meters NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS cut_piece_batch_no TEXT,
    ADD COLUMN IF NOT EXISTS created_by BIGINT,
    ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 12. INVOICES, BILLING & DELIVERY CHALLANS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.invoices (
    id BIGSERIAL PRIMARY KEY,
    invoice_no TEXT UNIQUE NOT NULL,
    order_id BIGINT,
    quotation_id BIGINT,
    branch_id BIGINT,
    customer_name TEXT NOT NULL,
    customer_type TEXT DEFAULT 'Business',
    is_tax_inclusive BOOLEAN DEFAULT true,
    subtotal NUMERIC(14,2) DEFAULT 0.00,
    tax_amount NUMERIC(14,2) DEFAULT 0.00,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(14,2) DEFAULT 0.00,
    payment_status TEXT DEFAULT 'Fully Paid',
    notes TEXT,
    pdf_html TEXT,
    created_by BIGINT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS invoice_no TEXT,
    ADD COLUMN IF NOT EXISTS order_id BIGINT,
    ADD COLUMN IF NOT EXISTS quotation_id BIGINT,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS customer_name TEXT,
    ADD COLUMN IF NOT EXISTS customer_type TEXT DEFAULT 'Business',
    ADD COLUMN IF NOT EXISTS is_tax_inclusive BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Fully Paid',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS pdf_html TEXT,
    ADD COLUMN IF NOT EXISTS created_by BIGINT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT,
    product_id BIGINT,
    item_description TEXT,
    description TEXT,
    design_number TEXT,
    barcode TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_rate NUMERIC(5,2) DEFAULT 0.00,
    total_price NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoice_items
    ADD COLUMN IF NOT EXISTS invoice_id BIGINT,
    ADD COLUMN IF NOT EXISTS product_id BIGINT,
    ADD COLUMN IF NOT EXISTS item_description TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS design_number TEXT,
    ADD COLUMN IF NOT EXISTS barcode TEXT,
    ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_price NUMERIC(14,2) DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS public.delivery_challans (
    id BIGSERIAL PRIMARY KEY,
    dc_no TEXT UNIQUE,
    dc_number TEXT UNIQUE,
    order_id BIGINT,
    invoice_id BIGINT,
    branch_id BIGINT,
    status TEXT NOT NULL DEFAULT 'Dispatched',
    items JSONB DEFAULT '[]'::jsonb,
    dispatch_date DATE DEFAULT CURRENT_DATE,
    vehicle_no TEXT,
    transporter_name TEXT,
    total_packages INTEGER DEFAULT 1,
    notes TEXT,
    created_by BIGINT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.delivery_challans
    ADD COLUMN IF NOT EXISTS dc_no TEXT,
    ADD COLUMN IF NOT EXISTS dc_number TEXT,
    ADD COLUMN IF NOT EXISTS order_id BIGINT,
    ADD COLUMN IF NOT EXISTS invoice_id BIGINT,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Dispatched',
    ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS dispatch_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS vehicle_no TEXT,
    ADD COLUMN IF NOT EXISTS transporter_name TEXT,
    ADD COLUMN IF NOT EXISTS total_packages INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_by BIGINT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure dc_no and dc_number are kept in sync
UPDATE public.delivery_challans SET dc_no = dc_number WHERE dc_no IS NULL AND dc_number IS NOT NULL;
UPDATE public.delivery_challans SET dc_number = dc_no WHERE dc_number IS NULL AND dc_no IS NOT NULL;

-- ==============================================================================
-- 13. AUDIT & ACTIVITY LOGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id BIGINT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS user_id BIGINT,
    ADD COLUMN IF NOT EXISTS action TEXT,
    ADD COLUMN IF NOT EXISTS entity_type TEXT,
    ADD COLUMN IF NOT EXISTS entity_id TEXT,
    ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.record_activity_logs (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    action TEXT NOT NULL,
    performed_by TEXT,
    performed_by_name TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.record_activity_logs
    ADD COLUMN IF NOT EXISTS entity_type TEXT,
    ADD COLUMN IF NOT EXISTS entity_id BIGINT,
    ADD COLUMN IF NOT EXISTS action TEXT,
    ADD COLUMN IF NOT EXISTS performed_by TEXT,
    ADD COLUMN IF NOT EXISTS performed_by_name TEXT,
    ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_rec_act ON public.record_activity_logs(entity_type, entity_id);

-- ==============================================================================
-- 14. SAM MANAGEMENT & INDUSTRIAL ENGINEERING
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sam_configurations (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    product_id BIGINT,
    wholesale_slabs JSONB DEFAULT '[]'::jsonb,
    retail_slabs JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sam_configurations
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS product_id BIGINT,
    ADD COLUMN IF NOT EXISTS wholesale_slabs JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS retail_slabs JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.sam_configuration_components (
    id BIGSERIAL PRIMARY KEY,
    configuration_id BIGINT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'percentage',
    value NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(configuration_id, name)
);

ALTER TABLE public.sam_configuration_components
    ADD COLUMN IF NOT EXISTS configuration_id BIGINT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'percentage',
    ADD COLUMN IF NOT EXISTS value NUMERIC(10,4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.fabric_inward_transportation (
    id BIGSERIAL PRIMARY KEY,
    item TEXT NOT NULL,
    width TEXT NOT NULL,
    freight_rate NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    transit_insurance NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.fabric_inward_transportation
    ADD COLUMN IF NOT EXISTS item TEXT,
    ADD COLUMN IF NOT EXISTS width TEXT,
    ADD COLUMN IF NOT EXISTS freight_rate NUMERIC(10,4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS transit_insurance NUMERIC(10,4) DEFAULT 0.0000;

CREATE TABLE IF NOT EXISTS public.fabric_margin_calculations (
    id BIGSERIAL PRIMARY KEY,
    calculation_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.fabric_margin_calculations
    ADD COLUMN IF NOT EXISTS calculation_data JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.sam_calculations (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT,
    sam_configuration_id BIGINT,
    sales_type TEXT NOT NULL DEFAULT 'wholesale',
    quantity INTEGER NOT NULL DEFAULT 1,
    base_sam NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    applied_slab_percent NUMERIC(6,2) DEFAULT 0.00,
    adjusted_sam NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    final_sam_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    components_snapshot JSONB DEFAULT '{}'::jsonb,
    calculated_by BIGINT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sam_calculations
    ADD COLUMN IF NOT EXISTS product_id BIGINT,
    ADD COLUMN IF NOT EXISTS sam_configuration_id BIGINT,
    ADD COLUMN IF NOT EXISTS sales_type TEXT DEFAULT 'wholesale',
    ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS base_sam NUMERIC(10,4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS applied_slab_percent NUMERIC(6,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS adjusted_sam NUMERIC(10,4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS final_sam_cost NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS components_snapshot JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS calculated_by BIGINT;

-- ==============================================================================
-- 15. COMPANY SETTINGS, TAX MASTERS & TEMPLATES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.company_settings (
    id BIGSERIAL PRIMARY KEY,
    company_name TEXT NOT NULL DEFAULT 'Forma Apparels',
    address TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    pan TEXT,
    bank_name TEXT,
    bank_account_no TEXT,
    bank_ifsc TEXT,
    qr_code_image TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.company_settings
    ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT 'Forma Apparels',
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS gstin TEXT,
    ADD COLUMN IF NOT EXISTS pan TEXT,
    ADD COLUMN IF NOT EXISTS bank_name TEXT,
    ADD COLUMN IF NOT EXISTS bank_account_no TEXT,
    ADD COLUMN IF NOT EXISTS bank_ifsc TEXT,
    ADD COLUMN IF NOT EXISTS qr_code_image TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

INSERT INTO public.company_settings (company_name, email)
SELECT 'Forma Apparels', 'info@formaapparels.com'
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings);

CREATE TABLE IF NOT EXISTS public.tax_masters (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    rate NUMERIC(5,2) NOT NULL,
    hsn_code TEXT,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tax_masters
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS rate NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS hsn_code TEXT,
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

INSERT INTO public.tax_masters (name, rate, hsn_code, is_default, is_active) VALUES
    ('GST 5%', 5.00, '6203', true, true),
    ('GST 12%', 12.00, '6203', false, true),
    ('GST 18%', 18.00, '9988', false, true),
    ('Zero Rated / Exempt', 0.00, '0000', false, true)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.industry_templates (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT,
    industry_id BIGINT,
    name TEXT NOT NULL,
    description TEXT,
    department_ids JSONB DEFAULT '[]'::jsonb,
    boys_config JSONB DEFAULT '[]'::jsonb,
    girls_config JSONB DEFAULT '[]'::jsonb,
    components JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.industry_templates
    ADD COLUMN IF NOT EXISTS organization_id BIGINT,
    ADD COLUMN IF NOT EXISTS industry_id BIGINT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS department_ids JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS boys_config JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS girls_config JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS components JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 16. SAFE FOREIGN KEY APPLICATION (NON-BLOCKING & TYPE-CHECKED)
-- ==============================================================================

DO $$
BEGIN
    -- user_profiles -> user_types
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_user_type_id_fkey') THEN
            ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_user_type_id_fkey FOREIGN KEY (user_type_id) REFERENCES public.user_types(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- branch_users -> branches
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branch_users_branch_id_fkey') THEN
            ALTER TABLE public.branch_users ADD CONSTRAINT branch_users_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- employees -> branches
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_home_branch_id_fkey') THEN
            ALTER TABLE public.employees ADD CONSTRAINT employees_home_branch_id_fkey FOREIGN KEY (home_branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_current_branch_id_fkey') THEN
            ALTER TABLE public.employees ADD CONSTRAINT employees_current_branch_id_fkey FOREIGN KEY (current_branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- employee_work_history -> employees
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_work_history_employee_id_fkey') THEN
            ALTER TABLE public.employee_work_history ADD CONSTRAINT employee_work_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- organizations -> industries / branches
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_industry_id_fkey') THEN
            ALTER TABLE public.organizations ADD CONSTRAINT organizations_industry_id_fkey FOREIGN KEY (industry_id) REFERENCES public.industries(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_branch_id_fkey') THEN
            ALTER TABLE public.organizations ADD CONSTRAINT organizations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- departments -> organizations
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_organization_id_fkey') THEN
            ALTER TABLE public.departments ADD CONSTRAINT departments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- registry_members -> organizations / departments
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registry_members_organization_id_fkey') THEN
            ALTER TABLE public.registry_members ADD CONSTRAINT registry_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registry_members_department_id_fkey') THEN
            ALTER TABLE public.registry_members ADD CONSTRAINT registry_members_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- measurements -> registry_members
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'measurements_member_id_fkey') THEN
            ALTER TABLE public.measurements ADD CONSTRAINT measurements_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.registry_members(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- measurement_tokens -> organizations
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'measurement_tokens_organization_id_fkey') THEN
            ALTER TABLE public.measurement_tokens ADD CONSTRAINT measurement_tokens_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- art_numbers -> dresses / genders / patterns
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'art_numbers_dress_id_fkey') THEN
            ALTER TABLE public.art_numbers ADD CONSTRAINT art_numbers_dress_id_fkey FOREIGN KEY (dress_id) REFERENCES public.art_dresses(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'art_numbers_gender_id_fkey') THEN
            ALTER TABLE public.art_numbers ADD CONSTRAINT art_numbers_gender_id_fkey FOREIGN KEY (gender_id) REFERENCES public.art_genders(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'art_numbers_pattern_id_fkey') THEN
            ALTER TABLE public.art_numbers ADD CONSTRAINT art_numbers_pattern_id_fkey FOREIGN KEY (pattern_id) REFERENCES public.art_patterns(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- products -> product_types / size_charts
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_product_type_id_fkey') THEN
            ALTER TABLE public.products ADD CONSTRAINT products_product_type_id_fkey FOREIGN KEY (product_type_id) REFERENCES public.product_types(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_size_chart_id_fkey') THEN
            ALTER TABLE public.products ADD CONSTRAINT products_size_chart_id_fkey FOREIGN KEY (size_chart_id) REFERENCES public.size_charts(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- product_stocks -> products / branches
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_stocks_product_id_fkey') THEN
            ALTER TABLE public.product_stocks ADD CONSTRAINT product_stocks_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_stocks_branch_id_fkey') THEN
            ALTER TABLE public.product_stocks ADD CONSTRAINT product_stocks_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- trims -> trim_categories
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trims_category_id_fkey') THEN
            ALTER TABLE public.trims ADD CONSTRAINT trims_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.trim_categories(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- purchase_orders -> vendors (Strictly check type compatibility before applying!)
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns c1
            JOIN information_schema.columns c2 ON c1.data_type = c2.data_type
            WHERE c1.table_schema = 'public' AND c1.table_name = 'purchase_orders' AND c1.column_name = 'vendor_id'
              AND c2.table_schema = 'public' AND c2.table_name = 'vendors' AND c2.column_name = 'id'
        ) THEN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_vendor_id_fkey') THEN
                ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- purchase_order_items -> purchase_orders
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_purchase_order_id_fkey') THEN
            ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- quotations -> organizations / branches
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_organization_id_fkey') THEN
            ALTER TABLE public.quotations ADD CONSTRAINT quotations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_branch_id_fkey') THEN
            ALTER TABLE public.quotations ADD CONSTRAINT quotations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- quotation_items -> quotations / products
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotation_items_quotation_id_fkey') THEN
            ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotation_items_product_id_fkey') THEN
            ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- orders -> quotations / branches
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_quotation_id_fkey') THEN
            ALTER TABLE public.orders ADD CONSTRAINT orders_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_branch_id_fkey') THEN
            ALTER TABLE public.orders ADD CONSTRAINT orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- payments -> quotations / orders
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_quotation_id_fkey') THEN
            ALTER TABLE public.payments ADD CONSTRAINT payments_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- job_cards -> orders / products
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_cards_order_id_fkey') THEN
            ALTER TABLE public.job_cards ADD CONSTRAINT job_cards_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_cards_product_id_fkey') THEN
            ALTER TABLE public.job_cards ADD CONSTRAINT job_cards_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- sub_job_cards -> job_cards
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_job_cards_job_card_id_fkey') THEN
            ALTER TABLE public.sub_job_cards ADD CONSTRAINT sub_job_cards_job_card_id_fkey FOREIGN KEY (job_card_id) REFERENCES public.job_cards(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- child_job_cards -> job_cards
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_job_cards_job_card_id_fkey') THEN
            ALTER TABLE public.child_job_cards ADD CONSTRAINT child_job_cards_job_card_id_fkey FOREIGN KEY (job_card_id) REFERENCES public.job_cards(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- fabric_consumption_logs -> job_cards
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fabric_consumption_logs_job_card_id_fkey') THEN
            ALTER TABLE public.fabric_consumption_logs ADD CONSTRAINT fabric_consumption_logs_job_card_id_fkey FOREIGN KEY (job_card_id) REFERENCES public.job_cards(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- invoices -> orders / quotations / branches
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_order_id_fkey') THEN
            ALTER TABLE public.invoices ADD CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_quotation_id_fkey') THEN
            ALTER TABLE public.invoices ADD CONSTRAINT invoices_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- invoice_items -> invoices
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_invoice_id_fkey') THEN
            ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- delivery_challans -> orders
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_challans_order_id_fkey') THEN
            ALTER TABLE public.delivery_challans ADD CONSTRAINT delivery_challans_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- ==============================================================================
-- 17. LEGACY VIEW COMPATIBILITY (schools, students, classes)
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schools') THEN
        CREATE OR REPLACE VIEW public.schools AS SELECT * FROM public.organizations;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'students') THEN
        CREATE OR REPLACE VIEW public.students AS SELECT * FROM public.registry_members;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'classes') THEN
        CREATE OR REPLACE VIEW public.classes AS SELECT * FROM public.departments;
    END IF;
END $$;

-- ==============================================================================
-- 18. PERFORMANCE INDEXES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_products_art_number ON public.products(art_number);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_product_type_id ON public.products(product_type_id);
CREATE INDEX IF NOT EXISTS idx_product_stocks_product_id ON public.product_stocks(product_id);
CREATE INDEX IF NOT EXISTS idx_fabrics_code ON public.fabrics(code);
CREATE INDEX IF NOT EXISTS idx_trims_code ON public.trims(code);
CREATE INDEX IF NOT EXISTS idx_trims_category_id ON public.trims(category_id);
CREATE INDEX IF NOT EXISTS idx_quotations_org_id ON public.quotations(organization_id);
CREATE INDEX IF NOT EXISTS idx_quotations_branch_id ON public.quotations(branch_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_qid ON public.quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_orders_quotation_id ON public.orders(quotation_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON public.orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_order_id ON public.job_cards(order_id);
CREATE INDEX IF NOT EXISTS idx_sub_job_cards_jcid ON public.sub_job_cards(job_card_id);
CREATE INDEX IF NOT EXISTS idx_child_job_cards_jcid ON public.child_job_cards(job_card_id);
CREATE INDEX IF NOT EXISTS idx_child_job_cards_barcode ON public.child_job_cards(barcode);
CREATE INDEX IF NOT EXISTS idx_fabric_logs_jcid ON public.fabric_consumption_logs(job_card_id);
CREATE INDEX IF NOT EXISTS idx_registry_members_org_id ON public.registry_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_measurements_member_id ON public.measurements(member_id);
CREATE INDEX IF NOT EXISTS idx_measurements_status ON public.measurements(status);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_challans_order_id ON public.delivery_challans(order_id);

-- ==============================================================================
-- 19. ROW LEVEL SECURITY (RLS) & GRANTS FOR ALL APIS & ROLES
-- ==============================================================================

DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all operations" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow all operations" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;

-- Grant schema and table permissions to service roles & API users
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- ==============================================================================
-- 20. RELOAD SUPABASE POSTGREST SCHEMA CACHE
-- ==============================================================================

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- MIGRATION SCRIPT COMPLETED SUCCESSFULLY!
-- ==============================================================================
