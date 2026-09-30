-- ==============================================================================
-- FORMA APPARELS / INLAND UNIFORM — MASTER DATABASE MIGRATION SCRIPT
-- Target: Supabase PostgreSQL (bnoisnaaqfhqeaaiizzv.supabase.co)
--
-- This script is completely IDEMPOTENT and safe to run multiple times:
-- 1. Creates all missing tables with all required columns.
-- 2. Uses ADD COLUMN IF NOT EXISTS for all existing tables to guarantee zero column errors.
-- 3. Configures exact foreign keys required by PostgREST nested queries.
-- 4. Enables RLS and grants permissions to anon, authenticated, and service_role.
-- 5. Signals PostgREST schema cache reload (NOTIFY pgrst, 'reload schema').
-- ==============================================================================

-- Enable UUID & Pgcrypto Extensions
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

-- Seed System Roles
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
    user_type_id UUID REFERENCES public.user_types(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS organization_id BIGINT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;




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


CREATE TABLE IF NOT EXISTS public.branch_users (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Branch Staff',
    password_plain TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 3. EMPLOYEES & WORK HISTORY
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.employees (
    id BIGSERIAL PRIMARY KEY,
    employee_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    designation TEXT,
    department TEXT,
    contact_mobile TEXT,
    email TEXT,
    joining_date DATE DEFAULT CURRENT_DATE,
    user_id BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS employee_type TEXT DEFAULT 'Permanent',
    ADD COLUMN IF NOT EXISTS is_deputed BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS deputed_branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS deputed_until DATE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS public.employee_work_history (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT REFERENCES public.employees(id) ON DELETE CASCADE,
    from_branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    to_branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    assignment_type TEXT DEFAULT 'Permanent',
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 4. INDUSTRIES, ORGANIZATIONS & ORGANIZATION STAFF
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.industries (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);


CREATE TABLE IF NOT EXISTS public.organizations (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    customer_code TEXT UNIQUE,
    industry_id BIGINT REFERENCES public.industries(id) ON DELETE SET NULL,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    user_id BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    contact_person TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS customer_code TEXT,
    ADD COLUMN IF NOT EXISTS relationship_manager_id BIGINT REFERENCES public.employees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_operator_id BIGINT REFERENCES public.employees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_special BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_risk BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS client_tag TEXT;

-- FIX FOR ERROR 1: GET /api/organizations/:id/staff (Missing table)
CREATE TABLE IF NOT EXISTS public.organization_staff (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id BIGINT REFERENCES public.employees(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT now(),
    allowed_measurement_fields JSONB DEFAULT '{}'::jsonb,
    UNIQUE(organization_id, employee_id)
);

ALTER TABLE public.organization_staff
    ADD COLUMN IF NOT EXISTS allowed_measurement_fields JSONB DEFAULT '{}'::jsonb;

-- FIX FOR ERROR 4: Department creation missing grade and section/division columns
CREATE TABLE IF NOT EXISTS public.departments (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.departments
    ADD COLUMN IF NOT EXISTS section TEXT,
    ADD COLUMN IF NOT EXISTS division TEXT,
    ADD COLUMN IF NOT EXISTS grade TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Keep section and division in sync if either is updated
UPDATE public.departments SET division = section WHERE division IS NULL AND section IS NOT NULL;
UPDATE public.departments SET section = division WHERE section IS NULL AND division IS NOT NULL;

-- Registry Members (Students / School or Corporate Members)
CREATE TABLE IF NOT EXISTS public.registry_members (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT REFERENCES public.organizations(id) ON DELETE CASCADE,
    department_id BIGINT REFERENCES public.departments(id) ON DELETE SET NULL,
    user_id BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    admission_no TEXT,
    gender TEXT,
    dob DATE,
    contact_number TEXT,
    email TEXT,
    notes TEXT,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.registry_members
    ADD COLUMN IF NOT EXISTS contact_mobile TEXT,
    ADD COLUMN IF NOT EXISTS contact_number TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';

-- ==============================================================================
-- 5. MEASUREMENTS & TOKENS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.measurements (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT REFERENCES public.registry_members(id) ON DELETE CASCADE,
    taken_by BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    reviewer_id BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Approved',
    measurements JSONB DEFAULT '{}'::jsonb,
    suggested_size TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.measurement_tokens (
    id BIGSERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    member_id BIGINT REFERENCES public.registry_members(id) ON DELETE CASCADE,
    organization_id BIGINT REFERENCES public.organizations(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.measurement_config (
    id BIGSERIAL PRIMARY KEY,
    label TEXT UNIQUE NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Inches',
    display_order INTEGER DEFAULT 1,
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.measurements
    ADD COLUMN IF NOT EXISTS recorded_by TEXT,
    ADD COLUMN IF NOT EXISTS dynamic_data JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS reviewer_id TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS remarks TEXT;

-- ==============================================================================
-- 6. DESIGN NUMBERS & GROUP DESIGN NUMBERS (FIX FOR ERROR 2)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.design_numbers (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_design_numbers (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE,
    design_number TEXT,
    name TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure column 'code' exists and is populated for all group_design_numbers
ALTER TABLE public.group_design_numbers
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS design_number TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.group_design_numbers
    ALTER COLUMN design_number DROP NOT NULL;

UPDATE public.group_design_numbers
SET code = COALESCE(code, design_number, name, 'DNG-' || id)
WHERE code IS NULL OR code = '';

UPDATE public.group_design_numbers
SET design_number = COALESCE(design_number, code, name, 'DNG-' || id)
WHERE design_number IS NULL OR design_number = '';

CREATE TABLE IF NOT EXISTS public.group_design_mappings (
    id BIGSERIAL PRIMARY KEY,
    parent_id BIGINT REFERENCES public.group_design_numbers(id) ON DELETE CASCADE,
    child_id BIGINT REFERENCES public.design_numbers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(parent_id, child_id)
);

-- Ensure quotations table has all required columns and reload PostgREST schema cache
ALTER TABLE public.quotations
    ADD COLUMN IF NOT EXISTS branch_id BIGINT,
    ADD COLUMN IF NOT EXISTS estimated_expenses NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_estimated_time TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS production_days_estimate INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
    ADD COLUMN IF NOT EXISTS profit_margin_percent NUMERIC(5,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS final_quote_value NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS metrics_summary JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS group_design_number_id BIGINT;

NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS public.art_dresses (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


CREATE TABLE IF NOT EXISTS public.art_genders (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


CREATE TABLE IF NOT EXISTS public.art_patterns (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


CREATE TABLE IF NOT EXISTS public.art_fits (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


CREATE TABLE IF NOT EXISTS public.art_numbers (
    id BIGSERIAL PRIMARY KEY,
    dress_id BIGINT REFERENCES public.art_dresses(id) ON DELETE CASCADE,
    gender_id BIGINT REFERENCES public.art_genders(id) ON DELETE CASCADE,
    pattern_id BIGINT REFERENCES public.art_patterns(id) ON DELETE CASCADE,
    fit_id BIGINT REFERENCES public.art_fits(id) ON DELETE SET NULL,
    code TEXT UNIQUE,
    art_number TEXT,
    base_size TEXT DEFAULT NULL,
    fit TEXT DEFAULT NULL,
    allowance TEXT DEFAULT NULL,
    description TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.art_numbers
    ADD COLUMN IF NOT EXISTS dress_id BIGINT REFERENCES public.art_dresses(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS gender_id BIGINT REFERENCES public.art_genders(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS pattern_id BIGINT REFERENCES public.art_patterns(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS fit_id BIGINT REFERENCES public.art_fits(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS base_size TEXT,
    ADD COLUMN IF NOT EXISTS fit TEXT,
    ADD COLUMN IF NOT EXISTS allowance TEXT;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS attachment_fabric1 NUMERIC(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS attachment_fabric2 NUMERIC(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS allowance TEXT;

-- Seed Default Art Number if missing (Format: Prefix-GenderPattern-Fit e.g. 4J-1012-R)
DO $$
DECLARE
    v_dress_id BIGINT;
    v_gender_id BIGINT;
    v_pattern_id BIGINT;
    v_fit_id BIGINT;
BEGIN
    SELECT id INTO v_dress_id FROM public.art_dresses WHERE code = '4J' LIMIT 1;
    SELECT id INTO v_gender_id FROM public.art_genders WHERE code = '1' LIMIT 1;
    SELECT id INTO v_pattern_id FROM public.art_patterns WHERE code = '012' LIMIT 1;
    SELECT id INTO v_fit_id FROM public.art_fits WHERE code = 'R' LIMIT 1;

    IF v_dress_id IS NOT NULL AND v_gender_id IS NOT NULL AND v_pattern_id IS NOT NULL THEN
        INSERT INTO public.art_numbers (dress_id, gender_id, pattern_id, fit_id, code, art_number, base_size, fit)
        VALUES (v_dress_id, v_gender_id, v_pattern_id, v_fit_id, '4J-1012-R', '4J-1012-R', 'M', 'Regular Fit')
        ON CONFLICT (code) DO NOTHING;
    END IF;
END $$;


-- ==============================================================================
-- 7. PRODUCTS, TYPES, SIZES & VARIANTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.product_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);



CREATE TABLE IF NOT EXISTS public.size_charts (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    gender TEXT,
    measurements JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    art_number TEXT UNIQUE NOT NULL,
    product_type_id BIGINT REFERENCES public.product_types(id) ON DELETE SET NULL,
    gender TEXT,
    measurements JSONB DEFAULT '[]'::jsonb,
    materials TEXT,
    base_price NUMERIC(12,2) DEFAULT 0.00,
    retail_sam_value NUMERIC(10,4) DEFAULT 0.0000,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS product_type TEXT,
    ADD COLUMN IF NOT EXISTS design_number_id BIGINT REFERENCES public.design_numbers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS base_size TEXT,
    ADD COLUMN IF NOT EXISTS fit TEXT,
    ADD COLUMN IF NOT EXISTS entry_method TEXT,
    ADD COLUMN IF NOT EXISTS sam_value NUMERIC(10,4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS fabric_ids JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS remarks TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

CREATE TABLE IF NOT EXISTS public.product_stocks (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES public.products(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    size TEXT NOT NULL,
    quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(product_id, size, branch_id)
);



CREATE TABLE IF NOT EXISTS public.product_design_variants (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES public.products(id) ON DELETE CASCADE,
    design_number_id BIGINT REFERENCES public.design_numbers(id) ON DELETE CASCADE,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 8. FABRICS, TRIMS & INVENTORY
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
    low_stock_threshold NUMERIC(12,2) DEFAULT 10.00,
    unit_price NUMERIC(12,2) DEFAULT 0.00,
    garment_category TEXT,
    description TEXT,
    image TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    vendors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.fabrics
    ADD COLUMN IF NOT EXISTS meters NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS sam_value NUMERIC(10,4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS latest_sam NUMERIC(10,2) DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS public.buttons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    unit_price NUMERIC(12,2) DEFAULT 0.00,
    quantity NUMERIC(12,2) DEFAULT 0.00,
    low_stock_threshold NUMERIC(12,2) DEFAULT 10.00,
    images JSONB DEFAULT '[]'::jsonb,
    vendors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.threads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    description TEXT,
    unit_price NUMERIC(12,2) DEFAULT 0.00,
    quantity NUMERIC(12,2) DEFAULT 0.00,
    low_stock_threshold NUMERIC(12,2) DEFAULT 10.00,
    images JSONB DEFAULT '[]'::jsonb,
    vendors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trim_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code_prefix TEXT NOT NULL UNIQUE,
    default_uom TEXT NOT NULL DEFAULT 'Pcs',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);


CREATE TABLE IF NOT EXISTS public.trims (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES public.trim_categories(id) ON DELETE RESTRICT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    uom TEXT NOT NULL DEFAULT 'Pcs',
    description TEXT,
    unit_price NUMERIC(12,2) DEFAULT 0.00,
    quantity NUMERIC(12,2) DEFAULT 0.00,
    low_stock_threshold NUMERIC(12,2) DEFAULT 10.00,
    images JSONB DEFAULT '[]'::jsonb,
    vendors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ==============================================================================
-- 9. VENDORS & PURCHASE ORDERS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.vendors (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id BIGSERIAL PRIMARY KEY,
    po_number TEXT UNIQUE NOT NULL,
    vendor_id BIGINT REFERENCES public.vendors(id) ON DELETE SET NULL,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    total_amount NUMERIC(14,2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL DEFAULT 'fabric',
    fabric_id UUID REFERENCES public.fabrics(id) ON DELETE SET NULL,
    trim_id UUID REFERENCES public.trims(id) ON DELETE SET NULL,
    quantity NUMERIC(12,2) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'Ordered',
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_entry_batches (
    id BIGSERIAL PRIMARY KEY,
    batch_no TEXT UNIQUE NOT NULL,
    po_id BIGINT REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    vendor_id BIGINT REFERENCES public.vendors(id) ON DELETE SET NULL,
    received_date DATE DEFAULT CURRENT_DATE,
    total_items INT DEFAULT 0,
    status TEXT DEFAULT 'Received',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id BIGSERIAL PRIMARY KEY,
    from_branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    to_branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity NUMERIC(12,2) NOT NULL,
    status TEXT DEFAULT 'Completed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.branch_inventory (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity NUMERIC(12,2) DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS public.inter_branch_transfers (
    id BIGSERIAL PRIMARY KEY,
    transfer_no TEXT UNIQUE NOT NULL,
    from_branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    to_branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity NUMERIC(12,2) NOT NULL,
    status TEXT DEFAULT 'Pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 10. SALES LEADS & CRM
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.leads (
    id BIGSERIAL PRIMARY KEY,
    lead_code TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    industry_id BIGINT REFERENCES public.industries(id) ON DELETE SET NULL,
    assigned_staff_id BIGINT REFERENCES public.employees(id) ON DELETE SET NULL,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'New',
    source TEXT,
    requirements TEXT,
    remarks JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS remarks JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ==============================================================================
-- 11. QUOTATIONS, ORDERS & PAYMENTS (FIX FOR ERROR 2)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.quotations (
    id BIGSERIAL PRIMARY KEY,
    quotation_no TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    organization_id BIGINT REFERENCES public.organizations(id) ON DELETE SET NULL,
    lead_id BIGINT REFERENCES public.leads(id) ON DELETE SET NULL,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    created_by BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    total_amount NUMERIC(14,2) DEFAULT 0.00,
    final_quote_value NUMERIC(14,2) DEFAULT 0.00,
    tax_percent NUMERIC(5,2) DEFAULT 5.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.quotations
    ADD COLUMN IF NOT EXISTS group_design_number_id BIGINT,
    ADD COLUMN IF NOT EXISTS pdf_html TEXT;

-- Safely bind FK to group_design_numbers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'quotations_group_design_number_id_fkey'
    ) THEN
        ALTER TABLE public.quotations
            ADD CONSTRAINT quotations_group_design_number_id_fkey 
            FOREIGN KEY (group_design_number_id) REFERENCES public.group_design_numbers(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id BIGSERIAL PRIMARY KEY,
    quotation_id BIGINT REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
    size TEXT,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    total_price NUMERIC(14,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.quotation_items
    ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS manual_item_name TEXT;

CREATE TABLE IF NOT EXISTS public.orders (
    id BIGSERIAL PRIMARY KEY,
    order_no TEXT UNIQUE NOT NULL,
    quotation_id BIGINT REFERENCES public.quotations(id) ON DELETE SET NULL,
    organization_id BIGINT REFERENCES public.organizations(id) ON DELETE SET NULL,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Pending Review',
    corporate_action TEXT NOT NULL DEFAULT 'Pending',
    corporate_reason TEXT,
    total_amount NUMERIC(14,2) DEFAULT 0.00,
    delivery_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);



CREATE TABLE IF NOT EXISTS public.payments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES public.orders(id) ON DELETE CASCADE,
    amount NUMERIC(14,2) NOT NULL,
    payment_mode TEXT NOT NULL DEFAULT 'Bank Transfer',
    transaction_ref TEXT,
    status TEXT NOT NULL DEFAULT 'Completed',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 12. FACTORY PRODUCTION, JOB CARDS & BARCODES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.job_cards (
    id BIGSERIAL PRIMARY KEY,
    job_card_no TEXT UNIQUE NOT NULL,
    order_id BIGINT REFERENCES public.orders(id) ON DELETE CASCADE,
    factory_branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    target_delivery_date DATE,
    status TEXT NOT NULL DEFAULT 'Pending PO Handler',
    current_stage TEXT NOT NULL DEFAULT 'Fabric Allocation',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sub_job_cards (
    id BIGSERIAL PRIMARY KEY,
    sub_job_card_no TEXT UNIQUE NOT NULL,
    job_card_id BIGINT REFERENCES public.job_cards(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    size_distribution JSONB DEFAULT '{}'::jsonb,
    stage TEXT NOT NULL DEFAULT 'Cutting',
    status TEXT NOT NULL DEFAULT 'In Production',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.child_job_cards (
    id BIGSERIAL PRIMARY KEY,
    child_card_no TEXT UNIQUE NOT NULL,
    job_card_id BIGINT REFERENCES public.job_cards(id) ON DELETE CASCADE,
    sub_job_card_id BIGINT REFERENCES public.sub_job_cards(id) ON DELETE SET NULL,
    order_id BIGINT REFERENCES public.orders(id) ON DELETE CASCADE,
    barcode TEXT UNIQUE NOT NULL,
    item_type TEXT NOT NULL DEFAULT 'standard',
    size TEXT,
    member_id BIGINT REFERENCES public.registry_members(id) ON DELETE SET NULL,
    member_name TEXT,
    admission_no TEXT,
    custom_measurements JSONB DEFAULT '{}'::jsonb,
    fabric_code TEXT,
    fabric_name TEXT,
    fabric_length NUMERIC,
    sequence_no INT NOT NULL DEFAULT 1,
    stage TEXT NOT NULL DEFAULT 'Cutting',
    status TEXT NOT NULL DEFAULT 'In Production',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fabric_consumption_logs (
    id BIGSERIAL PRIMARY KEY,
    job_card_id BIGINT REFERENCES public.job_cards(id) ON DELETE CASCADE,
    fabric_id TEXT,
    allocated_meters NUMERIC(10,2) DEFAULT 0.00,
    consumed_meters NUMERIC(10,2) DEFAULT 0.00,
    wastage_meters NUMERIC(10,2) DEFAULT 0.00,
    logged_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 13. INVOICES & DELIVERY CHALLANS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.invoices (
    id BIGSERIAL PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
    organization_id BIGINT REFERENCES public.organizations(id) ON DELETE SET NULL,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Issued',
    total_amount NUMERIC(14,2) NOT NULL,
    tax_amount NUMERIC(14,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    total_price NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_challans (
    id BIGSERIAL PRIMARY KEY,
    dc_number TEXT UNIQUE NOT NULL,
    order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
    invoice_id BIGINT REFERENCES public.invoices(id) ON DELETE SET NULL,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Dispatched',
    items JSONB DEFAULT '[]'::jsonb,
    dispatch_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 14. AUDIT & ACTIVITY LOGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.record_activity_logs (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    action TEXT NOT NULL,
    performed_by TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rec_act ON public.record_activity_logs(entity_type, entity_id);

-- ==============================================================================
-- 15. SAM MANAGEMENT & INDUSTRIAL ENGINEERING
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sam_configurations (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
    wholesale_slabs JSONB DEFAULT '[]'::jsonb,
    retail_slabs JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sam_configuration_components (
    id BIGSERIAL PRIMARY KEY,
    configuration_id BIGINT REFERENCES public.sam_configurations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'percentage',
    value NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(configuration_id, name)
);

CREATE TABLE IF NOT EXISTS public.fabric_inward_transportation (
    id BIGSERIAL PRIMARY KEY,
    item TEXT NOT NULL,
    width TEXT NOT NULL,
    freight_rate NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    transit_insurance NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fabric_margin_calculations (
    id BIGSERIAL PRIMARY KEY,
    calculation_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 16. COMPANY SETTINGS, TAX MASTERS & TEMPLATES
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
    organization_id BIGINT REFERENCES public.organizations(id) ON DELETE CASCADE,
    industry_id BIGINT REFERENCES public.industries(id) ON DELETE SET NULL,
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
    ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS industry_id BIGINT REFERENCES public.industries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS department_ids JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS boys_config JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS girls_config JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS components JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 17. ROW LEVEL SECURITY (RLS) & FULL PERMISSIONS FOR ALL ROLES
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

-- Grant schema and table permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- MIGRATION SCRIPT EXECUTION FINISHED!
-- ==============================================================================
