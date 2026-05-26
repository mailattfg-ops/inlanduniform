-- Create tables for Fabric SAM Management

-- 1. Inward Transportation Rates Table
CREATE TABLE IF NOT EXISTS public.fabric_inward_transportation (
    id BIGSERIAL PRIMARY KEY,
    item TEXT NOT NULL,          -- e.g. 'SHIRTING', 'SUITING', 'BOTTOM'
    width TEXT NOT NULL,         -- e.g. '36', '44', '58'
    rate NUMERIC(10, 2) NOT NULL, -- e.g. 2.00, 2.50
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.fabric_inward_transportation ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "Allow read access to authenticated users on fabric_inward_transport" 
    ON public.fabric_inward_transportation FOR SELECT USING (true);
CREATE POLICY "Allow all access to admins on fabric_inward_transport" 
    ON public.fabric_inward_transportation FOR ALL USING (true);


-- 2. Margin Calculations Table
CREATE TABLE IF NOT EXISTS public.fabric_margin_calculations (
    id BIGSERIAL PRIMARY KEY,
    sales_type TEXT NOT NULL,         -- e.g. 'RETAIL', 'WHOLESALE'
    customer_type TEXT NOT NULL,      -- e.g. 'DIRECT', 'AGENT', 'BEST'
    branded NUMERIC(10, 2) NOT NULL,  -- margin percentage (e.g. 100.00, 80.00)
    semi_branded NUMERIC(10, 2) NOT NULL,
    non_branded NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.fabric_margin_calculations ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "Allow read access to authenticated users on fabric_margins" 
    ON public.fabric_margin_calculations FOR SELECT USING (true);
CREATE POLICY "Allow all access to admins on fabric_margins" 
    ON public.fabric_margin_calculations FOR ALL USING (true);


-- Seed default data if empty
INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'SHIRTING', '36', 2.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation);

INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'SHIRTING', '44', 2.50 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation WHERE item='SHIRTING' AND width='44');

INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'SHIRTING', '58', 3.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation WHERE item='SHIRTING' AND width='58');

INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'SUITING', '58', 4.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation WHERE item='SUITING' AND width='58');

INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'BOTTOM', '36', 1.50 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation WHERE item='BOTTOM' AND width='36');

INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'BOTTOM', '44', 2.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation WHERE item='BOTTOM' AND width='44');

INSERT INTO public.fabric_inward_transportation (item, width, rate)
SELECT 'BOTTOM', '58', 2.50 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_inward_transportation WHERE item='BOTTOM' AND width='58');


-- Seed Margin calculations
INSERT INTO public.fabric_margin_calculations (sales_type, customer_type, branded, semi_branded, non_branded)
SELECT 'RETAIL', 'DIRECT', 100.00, 100.00, 100.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_margin_calculations);

INSERT INTO public.fabric_margin_calculations (sales_type, customer_type, branded, semi_branded, non_branded)
SELECT 'RETAIL', 'AGENT', 80.00, 80.00, 80.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_margin_calculations WHERE sales_type='RETAIL' AND customer_type='AGENT');

INSERT INTO public.fabric_margin_calculations (sales_type, customer_type, branded, semi_branded, non_branded)
SELECT 'RETAIL', 'BEST', 70.00, 70.00, 70.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_margin_calculations WHERE sales_type='RETAIL' AND customer_type='BEST');

INSERT INTO public.fabric_margin_calculations (sales_type, customer_type, branded, semi_branded, non_branded)
SELECT 'WHOLESALE', 'DIRECT', 30.00, 40.00, 50.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_margin_calculations WHERE sales_type='WHOLESALE' AND customer_type='DIRECT');

INSERT INTO public.fabric_margin_calculations (sales_type, customer_type, branded, semi_branded, non_branded)
SELECT 'WHOLESALE', 'AGENT', 20.00, 30.00, 40.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_margin_calculations WHERE sales_type='WHOLESALE' AND customer_type='AGENT');

INSERT INTO public.fabric_margin_calculations (sales_type, customer_type, branded, semi_branded, non_branded)
SELECT 'WHOLESALE', 'BEST', 10.00, 20.00, 30.00 WHERE NOT EXISTS (SELECT 1 FROM public.fabric_margin_calculations WHERE sales_type='WHOLESALE' AND customer_type='BEST');
