-- Migration 11: Create accessory_categories table and seed defaults
CREATE TABLE IF NOT EXISTS public.accessory_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code_prefix TEXT NOT NULL UNIQUE,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.accessory_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated on accessory_categories" ON public.accessory_categories;
CREATE POLICY "Allow all for authenticated on accessory_categories" ON public.accessory_categories FOR ALL USING (true);

-- Seed Standard Garment & Uniform Accessory Categories
INSERT INTO public.accessory_categories (name, code_prefix, is_system) VALUES
    ('Tie', 'TIE', true),
    ('Belt', 'BLT', true),
    ('Socks', 'SCK', true),
    ('Badge / Crest', 'BDG', true),
    ('Cap / Hat', 'CAP', true),
    ('Lanyard / ID Card', 'LAN', true),
    ('Scarf / Dupatta', 'SCF', true),
    ('Water Bottle / Lunchbox', 'BOT', true),
    ('Other Accessory', 'ACC', true)
ON CONFLICT (name) DO NOTHING;
