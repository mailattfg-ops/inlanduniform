-- ==============================================================================
-- SAM MANAGEMENT & FABRIC MARGINS CONSOLIDATED MIGRATION
-- Run this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Create parent configurations table
CREATE TABLE IF NOT EXISTS public.sam_configurations (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
    wholesale_slabs JSONB NOT NULL DEFAULT '[]'::jsonb,
    retail_slabs JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create child components table (representing cost heads as rows)
CREATE TABLE IF NOT EXISTS public.sam_configuration_components (
    id BIGSERIAL PRIMARY KEY,
    configuration_id BIGINT REFERENCES public.sam_configurations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'percentage',
    value NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(configuration_id, name)
);

-- 3. Create calculation history table
CREATE TABLE IF NOT EXISTS public.sam_calculations (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
    sam_configuration_id BIGINT REFERENCES public.sam_configurations(id) ON DELETE SET NULL,
    sales_type TEXT NOT NULL CHECK (sales_type IN ('wholesale', 'retail')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    base_sam NUMERIC(10,4) NOT NULL,
    applied_slab_percent NUMERIC(10,4) NOT NULL,
    adjusted_sam NUMERIC(10,4) NOT NULL,
    final_sam_cost NUMERIC(10,4) NOT NULL,
    components_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_by BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS) for SAM tables
ALTER TABLE public.sam_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sam_configuration_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sam_calculations ENABLE ROW LEVEL SECURITY;

-- 5. Policies for configurations
DROP POLICY IF EXISTS "Allow read access to authenticated users on sam_configurations" ON public.sam_configurations;
CREATE POLICY "Allow read access to authenticated users on sam_configurations" ON public.sam_configurations
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access to admins on sam_configurations" ON public.sam_configurations;
CREATE POLICY "Allow all access to admins on sam_configurations" ON public.sam_configurations
    FOR ALL USING (true);

-- 6. Policies for components
DROP POLICY IF EXISTS "Allow read access to authenticated users on sam_configuration_components" ON public.sam_configuration_components;
CREATE POLICY "Allow read access to authenticated users on sam_configuration_components" ON public.sam_configuration_components
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access to admins on sam_configuration_components" ON public.sam_configuration_components;
CREATE POLICY "Allow all access to admins on sam_configuration_components" ON public.sam_configuration_components
    FOR ALL USING (true);

-- 7. Policies for calculations
DROP POLICY IF EXISTS "Allow read access to authenticated users on sam_calculations" ON public.sam_calculations;
CREATE POLICY "Allow read access to authenticated users on sam_calculations" ON public.sam_calculations
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert access to authenticated users on sam_calculations" ON public.sam_calculations;
CREATE POLICY "Allow insert access to authenticated users on sam_calculations" ON public.sam_calculations
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to admins on sam_calculations" ON public.sam_calculations;
CREATE POLICY "Allow all access to admins on sam_calculations" ON public.sam_calculations
    FOR ALL USING (true);

-- 8. Seed Default Readymade SAM Configuration and Components
DO $$
DECLARE
    default_config_id BIGINT;
BEGIN
    SELECT id INTO default_config_id FROM public.sam_configurations WHERE name = 'Default Readymade SAM Setup' LIMIT 1;
    
    IF default_config_id IS NULL THEN
        INSERT INTO public.sam_configurations (name, product_id, is_active, wholesale_slabs, retail_slabs)
        VALUES (
            'Default Readymade SAM Setup',
            NULL,
            true,
            '[
                {"min_qty": 1, "max_qty": 2, "adjustment_percent": 100.0, "enabled": true},
                {"min_qty": 3, "max_qty": 10, "adjustment_percent": 40.0, "enabled": true},
                {"min_qty": 11, "max_qty": 25, "adjustment_percent": 30.0, "enabled": true},
                {"min_qty": 26, "max_qty": 100, "adjustment_percent": 20.0, "enabled": true},
                {"min_qty": 101, "max_qty": 200, "adjustment_percent": 10.0, "enabled": true},
                {"min_qty": 201, "max_qty": 500, "adjustment_percent": 0.0, "enabled": true},
                {"min_qty": 501, "max_qty": 1000, "adjustment_percent": -10.0, "enabled": true},
                {"min_qty": 1001, "max_qty": 2000, "adjustment_percent": -20.0, "enabled": true},
                {"min_qty": 2001, "max_qty": 5000, "adjustment_percent": -30.0, "enabled": true},
                {"min_qty": 5001, "max_qty": null, "adjustment_percent": -40.0, "enabled": true}
            ]'::jsonb,
            '[
                {"min_qty": 1, "max_qty": 2, "adjustment_percent": 30.0, "enabled": true},
                {"min_qty": 3, "max_qty": 10, "adjustment_percent": 50.0, "enabled": true},
                {"min_qty": 11, "max_qty": 25, "adjustment_percent": 50.0, "enabled": true},
                {"min_qty": 26, "max_qty": 100, "adjustment_percent": 40.0, "enabled": true},
                {"min_qty": 101, "max_qty": 200, "adjustment_percent": 40.0, "enabled": true},
                {"min_qty": 201, "max_qty": 500, "adjustment_percent": 30.0, "enabled": true},
                {"min_qty": 501, "max_qty": 1000, "adjustment_percent": 30.0, "enabled": true},
                {"min_qty": 1001, "max_qty": 2000, "adjustment_percent": 20.0, "enabled": true},
                {"min_qty": 2001, "max_qty": 5000, "adjustment_percent": 20.0, "enabled": true},
                {"min_qty": 5001, "max_qty": null, "adjustment_percent": 10.0, "enabled": true}
            ]'::jsonb
        ) RETURNING id INTO default_config_id;
        
        INSERT INTO public.sam_configuration_components (configuration_id, name, type, value) VALUES
        (default_config_id, 'Stitching', 'percentage', 140.0000),
        (default_config_id, 'Pattern + Cutting', 'percentage', 20.0000),
        (default_config_id, 'Threads + Buttons + Indirect', 'percentage', 22.0000),
        (default_config_id, 'Profit', 'percentage', 0.0000),
        (default_config_id, 'Service and Maintenance', 'percentage', 0.0000),
        (default_config_id, 'Business Development', 'percentage', 0.0000);
    END IF;
END $$;

-- 9. Inward Transportation Rates Table
CREATE TABLE IF NOT EXISTS public.fabric_inward_transportation (
    id BIGSERIAL PRIMARY KEY,
    item TEXT NOT NULL,
    width TEXT NOT NULL,
    rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if table was created in an older migration
ALTER TABLE public.fabric_inward_transportation 
ADD COLUMN IF NOT EXISTS rate NUMERIC(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- If older freight_rate column exists, migrate values to rate
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='fabric_inward_transportation' AND column_name='freight_rate'
    ) THEN
        UPDATE public.fabric_inward_transportation 
        SET rate = freight_rate 
        WHERE (rate = 0 OR rate IS NULL) AND freight_rate IS NOT NULL;
    END IF;
END $$;

ALTER TABLE public.fabric_inward_transportation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users on fabric_inward_transport" ON public.fabric_inward_transportation;
CREATE POLICY "Allow read access to authenticated users on fabric_inward_transport" 
    ON public.fabric_inward_transportation FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access to admins on fabric_inward_transport" ON public.fabric_inward_transportation;
CREATE POLICY "Allow all access to admins on fabric_inward_transport" 
    ON public.fabric_inward_transportation FOR ALL USING (true);

-- 10. Margin Calculations Table
CREATE TABLE IF NOT EXISTS public.fabric_margin_calculations (
    id BIGSERIAL PRIMARY KEY,
    sales_type TEXT NOT NULL,
    customer_type TEXT NOT NULL,
    branded NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    semi_branded NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    non_branded NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if table was created in an older migration
ALTER TABLE public.fabric_margin_calculations 
ADD COLUMN IF NOT EXISTS sales_type TEXT,
ADD COLUMN IF NOT EXISTS customer_type TEXT,
ADD COLUMN IF NOT EXISTS branded NUMERIC(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS semi_branded NUMERIC(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS non_branded NUMERIC(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.fabric_margin_calculations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users on fabric_margins" ON public.fabric_margin_calculations;
CREATE POLICY "Allow read access to authenticated users on fabric_margins" 
    ON public.fabric_margin_calculations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access to admins on fabric_margins" ON public.fabric_margin_calculations;
CREATE POLICY "Allow all access to admins on fabric_margins" 
    ON public.fabric_margin_calculations FOR ALL USING (true);

-- 11. Seed default fabric inward transportation
INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'SHIRTING', '36', 2.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation WHERE item='SHIRTING' AND width='36');

INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'SHIRTING', '44', 2.50 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation WHERE item='SHIRTING' AND width='44');

INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'SHIRTING', '58', 3.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation WHERE item='SHIRTING' AND width='58');

INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'SUITING', '58', 4.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation WHERE item='SUITING' AND width='58');

INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'BOTTOM', '36', 1.50 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation WHERE item='BOTTOM' AND width='36');

-- 12. Seed default fabric margins
INSERT INTO public.fabric_margin_calculations (sales_type, customer_type, branded, semi_branded, non_branded)
SELECT 'RETAIL', 'DIRECT', 100.00, 80.00, 60.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_margin_calculations WHERE sales_type='RETAIL' AND customer_type='DIRECT');

INSERT INTO public.fabric_margin_calculations (sales_type, customer_type, branded, semi_branded, non_branded)
SELECT 'WHOLESALE', 'AGENT', 40.00, 30.00, 20.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_margin_calculations WHERE sales_type='WHOLESALE' AND customer_type='AGENT');

INSERT INTO public.fabric_margin_calculations (sales_type, customer_type, branded, semi_branded, non_branded)
SELECT 'WHOLESALE', 'BEST', 25.00, 20.00, 15.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_margin_calculations WHERE sales_type='WHOLESALE' AND customer_type='BEST');
