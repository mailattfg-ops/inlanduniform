-- Migration 10: Create trim_categories and trims tables, seed defaults, and migrate existing threads & buttons
-- Allows dynamic trims (Zippers, Elastics, Labels, etc.) alongside Thread and Button.

-- 1. Create trim_categories table
CREATE TABLE IF NOT EXISTS public.trim_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code_prefix TEXT NOT NULL UNIQUE,
    default_uom TEXT NOT NULL DEFAULT 'Pcs',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trim_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated on trim_categories" ON public.trim_categories;
CREATE POLICY "Allow all for authenticated on trim_categories" ON public.trim_categories FOR ALL USING (true);

-- Seed Default Categories (Thread & Button are system defaults; others are common garment trims)
INSERT INTO public.trim_categories (name, code_prefix, default_uom, is_system) VALUES
    ('Thread', 'THR', 'Cones', true),
    ('Button', 'BTN', 'Pcs', true),
    ('Zipper', 'ZIP', 'Pcs', false),
    ('Elastic', 'ELA', 'Meters', false),
    ('Label', 'LBL', 'Pcs', false),
    ('Interlining', 'INT', 'Meters', false)
ON CONFLICT (name) DO NOTHING;

-- 2. Create trims table
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

-- Enable RLS
ALTER TABLE public.trims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated on trims" ON public.trims;
CREATE POLICY "Allow all for authenticated on trims" ON public.trims FOR ALL USING (true);

-- Index for fast lookup by category and code
CREATE INDEX IF NOT EXISTS idx_trims_category ON public.trims(category_id);
CREATE INDEX IF NOT EXISTS idx_trims_code ON public.trims(code);

-- 3. Safely migrate existing threads into trims
DO $$
DECLARE
    thread_cat_id UUID;
    button_cat_id UUID;
BEGIN
    SELECT id INTO thread_cat_id FROM public.trim_categories WHERE name = 'Thread' LIMIT 1;
    SELECT id INTO button_cat_id FROM public.trim_categories WHERE name = 'Button' LIMIT 1;

    -- Migrate threads
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'threads') THEN
        INSERT INTO public.trims (
            category_id, code, name, type, uom, description, 
            unit_price, quantity, low_stock_threshold, images, vendors, created_at
        )
        SELECT 
            thread_cat_id,
            t.code,
            t.name,
            COALESCE(t.type, 'Polyester'),
            'Cones',
            t.description,
            COALESCE(t.unit_price, 0.00),
            COALESCE(t.quantity, 0.00),
            COALESCE(t.low_stock_threshold, 10.00),
            COALESCE(t.images, '[]'::jsonb),
            COALESCE(t.vendors, '[]'::jsonb),
            COALESCE(t.created_at, now())
        FROM public.threads t
        ON CONFLICT (code) DO NOTHING;
    END IF;

    -- Migrate buttons
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'buttons') THEN
        INSERT INTO public.trims (
            category_id, code, name, type, uom, description, 
            unit_price, quantity, low_stock_threshold, images, vendors, created_at
        )
        SELECT 
            button_cat_id,
            b.code,
            b.name,
            'Fastener',
            'Pcs',
            b.description,
            COALESCE(b.unit_price, 0.00),
            COALESCE(b.quantity, 0.00),
            COALESCE(b.low_stock_threshold, 10.00),
            COALESCE(b.images, '[]'::jsonb),
            COALESCE(b.vendors, '[]'::jsonb),
            COALESCE(b.created_at, now())
        FROM public.buttons b
        ON CONFLICT (code) DO NOTHING;
    END IF;
END $$;
