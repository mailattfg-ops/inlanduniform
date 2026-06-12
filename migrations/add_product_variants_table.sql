-- Migration: Create product_design_variants table
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
