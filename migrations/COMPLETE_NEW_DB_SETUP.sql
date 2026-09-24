-- ==============================================================================
-- FORMA APPARELS / INLAND UNIFORM — COMPLETE MASTER DATABASE SETUP
-- Target: Fresh Supabase Project (PostgreSQL 15+)
-- 
-- Instructions:
-- 1. Open Supabase Dashboard > SQL Editor > New Query
-- 2. Paste this entire file and click "Run"
-- 3. Everything (all 35+ tables, foreign keys, default seeds, and Admin user)
--    will be created in one execution without dependency errors.
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. AUTHENTICATION, ROLES & USERS
-- ==============================================================================

-- User Types / Roles
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
    ('Staff', '["view_measurements", "manage_measurements"]'::jsonb)
ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions;

-- User Profiles
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

-- Seed Default Admin User
-- Email: admin@uniform.com
-- Password: Admin@#2024
INSERT INTO public.user_profiles (full_name, email, username, password, user_type_id)
VALUES (
    'System Administrator',
    'admin@uniform.com',
    'admin',
    'Admin@#2024',
    (SELECT id FROM public.user_types WHERE name = 'Admin' LIMIT 1)
)
ON CONFLICT (email) DO UPDATE 
SET password = EXCLUDED.password,
    user_type_id = EXCLUDED.user_type_id;

-- Staff / Employees Profile
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

-- ==============================================================================
-- 2. MULTI-BRANCH NETWORK & HUB
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.branches (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'Branch', -- Corporate, Factory, Branch
    address TEXT,
    contact_number TEXT,
    email TEXT,
    operational_settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.branches (code, name, tier, address) VALUES
    ('CORP-01', 'Headquarters Corporate', 'Corporate', 'Main Corporate HQ'),
    ('FACT-01', 'Central Factory Unit', 'Factory', 'Industrial Zone Factory 1'),
    ('BR-01', 'Main Branch', 'Branch', 'Downtown Main Outlet')
ON CONFLICT (code) DO NOTHING;

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
-- 3. INDUSTRIES, CLIENT ORGANIZATIONS & MEMBERS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.industries (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.industries (name, type) VALUES
    ('School', 'educational'), 
    ('Corporate', 'office'), 
    ('Healthcare', 'medical'), 
    ('Manufacturing', 'industrial'), 
    ('Hospitality', 'service')
ON CONFLICT (name) DO NOTHING;

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

CREATE TABLE IF NOT EXISTS public.departments (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

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
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 4. MEASUREMENTS & FITTING TOKENS
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

-- ==============================================================================
-- 5. PRODUCTS, TYPES, SIZES & VARIANTS
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

CREATE TABLE IF NOT EXISTS public.product_variants (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES public.products(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL,
    sku TEXT UNIQUE,
    price_delta NUMERIC(10,2) DEFAULT 0.00,
    attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 6. FABRICS, TRIMS & ACCESSORIES
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

-- Legacy Tables (maintained for compatibility)
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

-- Dynamic Trim Master & Items
CREATE TABLE IF NOT EXISTS public.trim_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code_prefix TEXT NOT NULL UNIQUE,
    default_uom TEXT NOT NULL DEFAULT 'Pcs',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.trim_categories (name, code_prefix, default_uom, is_system) VALUES
    ('Thread', 'THR', 'Cones', true),
    ('Button', 'BTN', 'Pcs', true),
    ('Zipper', 'ZIP', 'Pcs', false),
    ('Elastic', 'ELA', 'Meters', false),
    ('Label', 'LBL', 'Pcs', false),
    ('Interlining', 'INT', 'Meters', false)
ON CONFLICT (name) DO NOTHING;

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

CREATE INDEX IF NOT EXISTS idx_trims_cat ON public.trims(category_id);
CREATE INDEX IF NOT EXISTS idx_trims_code ON public.trims(code);

-- ==============================================================================
-- 7. VENDORS & PURCHASE ORDERS
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

-- ==============================================================================
-- 8. SALES LEADS & CRM
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

-- ==============================================================================
-- 9. QUOTATIONS, ORDERS & PAYMENTS
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

CREATE TABLE IF NOT EXISTS public.order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
    size TEXT,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    total_price NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
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
-- 10. FACTORY PRODUCTION, JOB CARDS & BARCODES
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
-- 11. INVOICES & DELIVERY CHALLANS (DC)
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
-- 12. AUDIT TRAIL & SYSTEM ACTIVITY LOGS
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
-- 13. SAM INDUSTRIAL ENGINEERING & PRICING MATRICES
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

-- ==============================================================================
-- 14. COMPANY SETTINGS, TAXES & DESIGN CATALOGS
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
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.tax_masters (name, rate) VALUES
    ('GST 5%', 5.00),
    ('GST 12%', 12.00),
    ('GST 18%', 18.00)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.art_numbers (
    id BIGSERIAL PRIMARY KEY,
    art_number TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_design_numbers (
    id BIGSERIAL PRIMARY KEY,
    design_number TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 15. ROW LEVEL SECURITY (RLS) POLICIES
-- Enable RLS and grant service role / authenticated access
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

-- Grant schema and table permissions to Supabase roles
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- SETUP COMPLETE!
-- Admin Login Credentials:
-- Email:    admin@uniform.com   (or username: admin)
-- Password: Admin@#2024
-- ==============================================================================
