-- ==============================================================================
-- FIX MEASUREMENTS CONFIG, FABRICS SAM, AND PRODUCT DROPDOWNS
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bnoisnaaqfhqeaaiizzv/sql/new
-- ==============================================================================

-- 1. MEASUREMENT CONFIG TABLE & STANDARD METRIC SEEDS
CREATE TABLE IF NOT EXISTS public.measurement_config (
    id BIGSERIAL PRIMARY KEY,
    label TEXT UNIQUE NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Inches',
    display_order INTEGER DEFAULT 1,
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed standard garment measurement points
INSERT INTO public.measurement_config (label, unit, display_order, is_required)
VALUES 
    ('Chest', 'Inches', 1, true),
    ('Waist', 'Inches', 2, true),
    ('Length', 'Inches', 3, true),
    ('Shoulder', 'Inches', 4, false),
    ('Sleeve Length', 'Inches', 5, false),
    ('Neck', 'Inches', 6, false),
    ('Hip', 'Inches', 7, false),
    ('Inseam', 'Inches', 8, false)
ON CONFLICT (label) DO UPDATE SET
    unit = EXCLUDED.unit,
    display_order = EXCLUDED.display_order;

-- 2. ENSURE MEASUREMENTS TABLE HAS ALL NEEDED ATTRIBUTES
CREATE TABLE IF NOT EXISTS public.measurements (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT REFERENCES public.registry_members(id) ON DELETE CASCADE,
    taken_by BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    reviewer_id TEXT,
    reviewed_at TIMESTAMPTZ,
    recorded_by TEXT,
    recorded_at TIMESTAMPTZ DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'Approved',
    measurements JSONB DEFAULT '{}'::jsonb,
    dynamic_data JSONB DEFAULT '{}'::jsonb,
    suggested_size TEXT,
    notes TEXT,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.measurements
    ADD COLUMN IF NOT EXISTS recorded_by TEXT,
    ADD COLUMN IF NOT EXISTS dynamic_data JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS reviewer_id TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 3. ENSURE FABRICS TABLE HAS SAM & EXTRA FIELDS
CREATE TABLE IF NOT EXISTS public.fabrics (
    id BIGSERIAL PRIMARY KEY,
    item_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    brand_name TEXT,
    quantity NUMERIC(12,2) DEFAULT 0.00,
    unit_price NUMERIC(12,2) DEFAULT 0.00,
    meters NUMERIC(12,2) DEFAULT 0.00,
    shade TEXT,
    width TEXT,
    latest_sam NUMERIC(10,2) DEFAULT 0.00,
    sam_value NUMERIC(10,2) DEFAULT 0.00,
    vendors JSONB DEFAULT '[]'::jsonb,
    images JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.fabrics
    ADD COLUMN IF NOT EXISTS brand_name TEXT,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS meters NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS shade TEXT,
    ADD COLUMN IF NOT EXISTS width TEXT,
    ADD COLUMN IF NOT EXISTS latest_sam NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS sam_value NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS vendors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- 4. ENSURE INDUSTRY_TEMPLATES HAS ORGANIZATION_ID AND UNIFORM CONFIG COLUMNS
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

-- 5. SEED PRODUCT MASTER TABLES (Genders, Fits, Types, Patterns)
CREATE TABLE IF NOT EXISTS public.art_genders (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.art_genders (name, code) VALUES
    ('Boys', '1'),
    ('Girls', '2'),
    ('Unisex', '3'),
    ('Men', '4'),
    ('Women', '5'),
    ('Kids', '6')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

CREATE TABLE IF NOT EXISTS public.art_fits (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.art_fits (name, code, description) VALUES
    ('Regular Fit', 'R', 'Standard classic regular cut'),
    ('Slim Fit', 'S', 'Tailored slim modern cut'),
    ('Loose Fit', 'L', 'Relaxed comfort loose cut'),
    ('Comfort Fit', 'C', 'Generous athletic fit')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

CREATE TABLE IF NOT EXISTS public.product_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.product_types (name, description) VALUES
    ('Uniform Shirt', 'Standard formal and casual school/corporate shirts'),
    ('Uniform Trouser', 'Formal pants, trousers and bottoms'),
    ('Blazer', 'Formal tailored blazers and suits'),
    ('Skirt', 'Box-pleat and regular school skirts'),
    ('Polo', 'Polo t-shirts and sports wear'),
    ('Vest', 'Waistcoats and sweater vests'),
    ('Pinafore', 'Traditional school tunic/pinafore'),
    ('Salwar', 'Bottom salwar pants'),
    ('Kurti', 'Top uniform tunic/kurti'),
    ('T-Shirt', 'Round-neck sports/house t-shirts'),
    ('Track Pant', 'Sports track bottoms'),
    ('Accessories', 'Belts, ties, socks, badges and accessory items')
ON CONFLICT (name) DO NOTHING;

-- 5. ENSURE PRODUCTS AND ART_NUMBERS HAVE ALLOWANCE AND ATTACHMENT FABRIC COLUMNS
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS attachment_fabric1 NUMERIC(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS attachment_fabric2 NUMERIC(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS allowance TEXT;

ALTER TABLE public.art_numbers
    ADD COLUMN IF NOT EXISTS allowance TEXT;

-- 6. RLS & PERMISSIONS REFRESH
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

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- 6. RELOAD SUPABASE POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
