-- ================================================================
-- PENDING DATABASE MIGRATIONS
-- Run these SQL statements in your Supabase SQL Editor
-- (Project Settings > SQL Editor or Table Editor > SQL)
-- ================================================================

-- 1. Add design_number column to products table
--    This enables auto-generated DN-XXXX design numbers
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS design_number TEXT UNIQUE DEFAULT NULL;

-- 2. Create company_settings table for address and bank details
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT one_row CHECK (id = 1)
);

INSERT INTO public.company_settings (id, company_name)
VALUES (1, 'Forma Apparels')
ON CONFLICT (id) DO NOTHING;

-- 3. Add pdf_html column to quotations table
ALTER TABLE public.quotations 
  ADD COLUMN IF NOT EXISTS pdf_html TEXT;

-- 4. Add quantity and low_stock_threshold to buttons and threads tables
ALTER TABLE public.buttons
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(10, 2) DEFAULT 10.00;

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(10, 2) DEFAULT 10.00;

-- 5. Add main_fabric_id, button_id, and thread_id back to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS main_fabric_id UUID REFERENCES public.fabrics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS button_id UUID REFERENCES public.buttons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL;

-- 6. Create product_design_variants table
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
DROP POLICY IF EXISTS "Public Read" ON public.product_design_variants;
DROP POLICY IF EXISTS "Admin All" ON public.product_design_variants;
CREATE POLICY "Public Read" ON public.product_design_variants FOR SELECT USING (true);
CREATE POLICY "Admin All" ON public.product_design_variants FOR ALL USING (true);

-- ================================================================
-- All other migrations should already be applied.
-- The above is the only pending migration.
-- ================================================================
