-- ==============================================================================
-- FORMA ERP: COMPLETE MASTER DATABASE MIGRATION SCRIPT
-- Safe & Idempotent: Run in your Supabase SQL Editor
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ART NUMBER HUB (4 TABLES STRUCTURE & CLEAN RESOLUTION)
-- ------------------------------------------------------------------------------

-- 1.0 Drop legacy empty table so it is recreated with the correct foreign keys
DROP TABLE IF EXISTS public.art_numbers CASCADE;

-- 1.1 Dress Prefixes
CREATE TABLE IF NOT EXISTS public.art_dresses (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Gender Codes
CREATE TABLE IF NOT EXISTS public.art_genders (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 Pattern Codes
CREATE TABLE IF NOT EXISTS public.art_patterns (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 Art Numbers Registry (Combined: [DressPrefix]-[GenderCode]-[PatternCode])
CREATE TABLE public.art_numbers (
    id BIGSERIAL PRIMARY KEY,
    dress_id BIGINT REFERENCES public.art_dresses(id) ON DELETE CASCADE,
    gender_id BIGINT REFERENCES public.art_genders(id) ON DELETE CASCADE,
    pattern_id BIGINT REFERENCES public.art_patterns(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL, -- Format: e.g. "4J-1-012"
    base_size TEXT DEFAULT NULL,
    fit TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) for Art Number Hub
ALTER TABLE public.art_dresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_genders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_numbers ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policies
DROP POLICY IF EXISTS "allow_all_art_dresses" ON public.art_dresses;
CREATE POLICY "allow_all_art_dresses" ON public.art_dresses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_art_genders" ON public.art_genders;
CREATE POLICY "allow_all_art_genders" ON public.art_genders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_art_patterns" ON public.art_patterns;
CREATE POLICY "allow_all_art_patterns" ON public.art_patterns FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_art_numbers" ON public.art_numbers;
CREATE POLICY "allow_all_art_numbers" ON public.art_numbers FOR ALL USING (true) WITH CHECK (true);

-- Seed Data: Dress Prefixes
INSERT INTO public.art_dresses (code, name, description) VALUES
('4J', 'Cotton Shirt', 'Standard Cotton Shirts'),
('6B', 'Trousers', 'Standard Trousers'),
('5K', 'Blazer', 'Formal Blazers'),
('7M', 'Skirt', 'School & Corporate Skirts')
ON CONFLICT (code) DO NOTHING;

-- Seed Data: Gender Codes
INSERT INTO public.art_genders (code, name) VALUES
('1', 'Male'),
('2', 'Female'),
('3', 'Unisex')
ON CONFLICT (code) DO NOTHING;

-- Seed Data: Pattern Codes
INSERT INTO public.art_patterns (code, name) VALUES
('012', 'Striped'),
('045', 'Checkered'),
('100', 'Solid Color')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 1.5 PRODUCT TYPES / GARMENT CATEGORIES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_read_product_types" ON public.product_types;
CREATE POLICY "allow_read_product_types" ON public.product_types FOR SELECT USING (true);
DROP POLICY IF EXISTS "allow_all_product_types" ON public.product_types;
CREATE POLICY "allow_all_product_types" ON public.product_types FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.product_types (name) VALUES 
('Shirt'), 
('Trousers'), 
('Blazer'), 
('Skirt'), 
('Tie'), 
('Polo'), 
('Vest'),
('Accessories')
ON CONFLICT (name) DO NOTHING;

-- Seed Data: Pre-registered Combined ART Number (4J-1-012)
DO $$
DECLARE
    v_dress_id BIGINT;
    v_gender_id BIGINT;
    v_pattern_id BIGINT;
BEGIN
    SELECT id INTO v_dress_id FROM public.art_dresses WHERE code = '4J' LIMIT 1;
    SELECT id INTO v_gender_id FROM public.art_genders WHERE code = '1' LIMIT 1;
    SELECT id INTO v_pattern_id FROM public.art_patterns WHERE code = '012' LIMIT 1;

    IF v_dress_id IS NOT NULL AND v_gender_id IS NOT NULL AND v_pattern_id IS NOT NULL THEN
        INSERT INTO public.art_numbers (dress_id, gender_id, pattern_id, code, base_size, fit)
        VALUES (v_dress_id, v_gender_id, v_pattern_id, '4J-1-012', 'M', 'regular fit')
        ON CONFLICT (code) DO NOTHING;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. DESIGN NUMBERS & GROUP DESIGN NUMBERS (PREREQUISITE FOR VARIANTS)
-- ------------------------------------------------------------------------------

-- 2.1 Individual Design Numbers (DNS-XXXX)
CREATE TABLE IF NOT EXISTS public.design_numbers (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.design_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_design_numbers" ON public.design_numbers;
CREATE POLICY "allow_all_design_numbers" ON public.design_numbers FOR ALL USING (true) WITH CHECK (true);

-- 2.2 Group Design Numbers (DNG-XXXX)
CREATE TABLE IF NOT EXISTS public.group_design_numbers (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.group_design_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_group_design_numbers" ON public.group_design_numbers;
CREATE POLICY "allow_all_group_design_numbers" ON public.group_design_numbers FOR ALL USING (true) WITH CHECK (true);

-- 2.3 Group Design Mappings (Parent Group -> Child Designs)
CREATE TABLE IF NOT EXISTS public.group_design_mappings (
    id BIGSERIAL PRIMARY KEY,
    parent_id BIGINT REFERENCES public.group_design_numbers(id) ON DELETE CASCADE,
    child_id BIGINT REFERENCES public.design_numbers(id) ON DELETE CASCADE,
    remarks TEXT,
    UNIQUE(parent_id, child_id)
);

ALTER TABLE public.group_design_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_group_design_mappings" ON public.group_design_mappings;
CREATE POLICY "allow_all_group_design_mappings" ON public.group_design_mappings FOR ALL USING (true) WITH CHECK (true);

-- Seed default initial design number if table is empty
INSERT INTO public.design_numbers (code, name, description) VALUES
('DNS-0001', 'Default Shirt Design', 'Standard factory default design specification')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. PRODUCT DESIGN VARIANTS TABLE
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_design_variants (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES public.products(id) ON DELETE CASCADE,
    design_number_id BIGINT REFERENCES public.design_numbers(id) ON DELETE CASCADE UNIQUE,
    button_id UUID REFERENCES public.buttons(id) ON DELETE SET NULL,
    thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
    button_count INTEGER DEFAULT 0,
    thread_count INTEGER DEFAULT 0,
    material_combination TEXT,
    variant_status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(product_id, button_id, thread_id)
);

ALTER TABLE public.product_design_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_product_design_variants" ON public.product_design_variants;
CREATE POLICY "allow_all_product_design_variants" ON public.product_design_variants FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. PRODUCTS TABLE COLUMNS & CONSTRAINTS
-- ------------------------------------------------------------------------------

ALTER TABLE public.products 
    ADD COLUMN IF NOT EXISTS design_number TEXT UNIQUE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS main_fabric_id UUID REFERENCES public.fabrics(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS button_id UUID REFERENCES public.buttons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS base_size TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS fit TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS other_sizes TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS other_fits TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS measurement_type TEXT DEFAULT 'both',
    ADD COLUMN IF NOT EXISTS class_fabric_consumption JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS remarks JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS sam_value NUMERIC(10, 4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS retail_sam_value NUMERIC(10, 4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS product_type_id BIGINT REFERENCES public.product_types(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS design_number_id BIGINT REFERENCES public.design_numbers(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 5. EMPLOYEES & TEMPORARY DEPUTATION FIELDS
-- ------------------------------------------------------------------------------

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'Permanent',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS temp_branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS temp_branch_until DATE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS temp_branch_notes TEXT DEFAULT NULL;

-- ------------------------------------------------------------------------------
-- 6. EMPLOYEE WORK HISTORY TABLE
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_work_history (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT REFERENCES public.employees(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_work_history_emp_id ON public.employee_work_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_history_branch_id ON public.employee_work_history(branch_id);
CREATE INDEX IF NOT EXISTS idx_work_history_is_current ON public.employee_work_history(is_current);

ALTER TABLE public.employee_work_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_employee_work_history" ON public.employee_work_history;
CREATE POLICY "allow_all_employee_work_history" ON public.employee_work_history FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 7. AUDIT LOGS TABLE
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_audit_logs" ON public.audit_logs;
CREATE POLICY "allow_all_audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 8. COMPANY SETTINGS TABLE
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_settings (
    id INT PRIMARY KEY DEFAULT 1,
    company_name TEXT DEFAULT 'Forma Apparels',
    address TEXT DEFAULT '63/3608, CD Tower, Arayidathupalam, Kozhikode, Kerala - 673 004, India',
    phone TEXT DEFAULT '(+91) 7902 499 990 | 0495 2 922 992',
    email TEXT DEFAULT 'info@formaapparels.com',
    website TEXT DEFAULT 'www.formaapparels.com',
    bank_name TEXT DEFAULT 'HDFC BANK',
    account_no TEXT DEFAULT '50200076116064',
    branch_name TEXT DEFAULT 'MAJESTIC CENTER',
    ifsc_code TEXT DEFAULT 'HDFC0001255',
    upi_id TEXT DEFAULT '7902 499 991',
    gstin TEXT DEFAULT NULL,
    pan TEXT DEFAULT NULL,
    qr_code_image TEXT DEFAULT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT one_row CHECK (id = 1)
);

INSERT INTO public.company_settings (id, company_name)
VALUES (1, 'Forma Apparels')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 9. QUOTATIONS & ITEMS FIELDS
-- ------------------------------------------------------------------------------

ALTER TABLE public.quotations 
    ADD COLUMN IF NOT EXISTS pdf_html TEXT,
    ADD COLUMN IF NOT EXISTS group_design_number_id BIGINT REFERENCES public.group_design_numbers(id) ON DELETE SET NULL;

ALTER TABLE public.quotation_items
    ADD COLUMN IF NOT EXISTS fabric_id UUID REFERENCES public.fabrics(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sam_value NUMERIC(8,4) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS design_number TEXT DEFAULT NULL;

-- ------------------------------------------------------------------------------
-- 10. TRIMS & INVENTORY
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trim_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    code_prefix TEXT UNIQUE NOT NULL,
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
    unit_price NUMERIC(12, 2) DEFAULT 0.00,
    quantity NUMERIC(12, 2) DEFAULT 0.00,
    low_stock_threshold NUMERIC(12, 2) DEFAULT 10.00,
    images JSONB DEFAULT '[]'::jsonb,
    vendors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.trims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_trims" ON public.trims;
CREATE POLICY "allow_all_trims" ON public.trims FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 11. NOTIFY POSTGREST SCHEMA CACHE RELOAD
-- ------------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
