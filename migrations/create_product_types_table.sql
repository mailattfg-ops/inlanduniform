-- Migration: Create Product Types Table and Add product_type_id to products

CREATE TABLE IF NOT EXISTS public.product_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;

-- Dynamic Policies for Admins / Authenticated Users
CREATE POLICY "Allow public read for product_types" ON public.product_types FOR SELECT USING (true);
CREATE POLICY "Allow all for admins on product_types" ON public.product_types FOR ALL USING (true);

-- Add product_type_id to products table referencing product_types(id)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type_id BIGINT REFERENCES public.product_types(id) ON DELETE SET NULL;

-- Seed initial product types
INSERT INTO public.product_types (name) VALUES 
('Shirt'), 
('Trousers'), 
('Blazer'), 
('Skirt'), 
('Tie'), 
('Polo'), 
('Vest')
ON CONFLICT (name) DO NOTHING;
