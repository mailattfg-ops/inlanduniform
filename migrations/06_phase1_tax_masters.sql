-- Migration: 06 Phase 1 Tax Masters Setup
-- PRD M1.2: Master data setup - tax masters with GST slabs

CREATE TABLE IF NOT EXISTS public.tax_masters (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    rate NUMERIC(5,2) NOT NULL,
    hsn_code TEXT,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tax_masters ENABLE ROW LEVEL SECURITY;

-- Allow read to authenticated users
DROP POLICY IF EXISTS "Allow read access to authenticated users on tax_masters" ON public.tax_masters;
CREATE POLICY "Allow read access to authenticated users on tax_masters" 
    ON public.tax_masters FOR SELECT USING (true);

-- Allow all to admins/service
DROP POLICY IF EXISTS "Allow full access on tax_masters" ON public.tax_masters;
CREATE POLICY "Allow full access on tax_masters" 
    ON public.tax_masters FOR ALL USING (true);

-- Seed standard Indian GST apparel & textile tax slabs if empty
INSERT INTO public.tax_masters (name, rate, hsn_code, is_default, is_active)
SELECT 'GST 5% - Apparel < ₹1,000', 5.00, '6203', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.tax_masters WHERE rate = 5.00);

INSERT INTO public.tax_masters (name, rate, hsn_code, is_default, is_active)
SELECT 'GST 12% - Apparel ≥ ₹1,000', 12.00, '6203', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.tax_masters WHERE rate = 12.00);

INSERT INTO public.tax_masters (name, rate, hsn_code, is_default, is_active)
SELECT 'GST 18% - Services & Synthetic Fabrics', 18.00, '9988', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.tax_masters WHERE rate = 18.00);

INSERT INTO public.tax_masters (name, rate, hsn_code, is_default, is_active)
SELECT 'Zero Rated / Exempt (0%)', 0.00, '0000', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.tax_masters WHERE rate = 0.00);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
