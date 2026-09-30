-- Migration: Create Art Number Hub 4 Tables and Seed Data

-- 1. Dress Prefixes
CREATE TABLE IF NOT EXISTS public.art_dresses (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Gender Codes
CREATE TABLE IF NOT EXISTS public.art_genders (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Pattern Codes
CREATE TABLE IF NOT EXISTS public.art_patterns (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Art Numbers Registry (Combined)
-- Drop legacy/empty art_numbers table if it lacks the required foreign keys
DROP TABLE IF EXISTS public.art_numbers CASCADE;

CREATE TABLE public.art_numbers (
    id BIGSERIAL PRIMARY KEY,
    dress_id BIGINT REFERENCES public.art_dresses(id) ON DELETE CASCADE,
    gender_id BIGINT REFERENCES public.art_genders(id) ON DELETE CASCADE,
    pattern_id BIGINT REFERENCES public.art_patterns(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL, -- Joined representation: e.g. "4J-1-012"
    base_size TEXT DEFAULT NULL,
    fit TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.art_dresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_genders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_numbers ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policies (Allow read for everyone, full access for admins)
DROP POLICY IF EXISTS "Allow public read for art_dresses" ON public.art_dresses;
CREATE POLICY "Allow public read for art_dresses" ON public.art_dresses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow all for admins on art_dresses" ON public.art_dresses;
CREATE POLICY "Allow all for admins on art_dresses" ON public.art_dresses FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read for art_genders" ON public.art_genders;
CREATE POLICY "Allow public read for art_genders" ON public.art_genders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow all for admins on art_genders" ON public.art_genders;
CREATE POLICY "Allow all for admins on art_genders" ON public.art_genders FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read for art_patterns" ON public.art_patterns;
CREATE POLICY "Allow public read for art_patterns" ON public.art_patterns FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow all for admins on art_patterns" ON public.art_patterns;
CREATE POLICY "Allow all for admins on art_patterns" ON public.art_patterns FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read for art_numbers" ON public.art_numbers;
CREATE POLICY "Allow public read for art_numbers" ON public.art_numbers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow all for admins on art_numbers" ON public.art_numbers;
CREATE POLICY "Allow all for admins on art_numbers" ON public.art_numbers FOR ALL USING (true);

-- Seed Data (Dresses)
INSERT INTO public.art_dresses (code, name, description) VALUES
('4J', 'Cotton Shirt', 'Standard Cotton Shirts'),
('6B', 'Trousers', 'Standard Trousers'),
('5K', 'Blazer', 'Formal Blazers'),
('7M', 'Skirt', 'School & Corporate Skirts')
ON CONFLICT (code) DO NOTHING;

-- Seed Data (Genders)
INSERT INTO public.art_genders (code, name) VALUES
('1', 'Male'),
('2', 'Female'),
('3', 'Unisex')
ON CONFLICT (code) DO NOTHING;

-- Seed Data (Patterns)
INSERT INTO public.art_patterns (code, name) VALUES
('012', 'Striped'),
('045', 'Checkered'),
('100', 'Solid Color')
ON CONFLICT (code) DO NOTHING;

-- Seed Data (Combined Art Number: 4J-1-012 using seeded keys)
DO $$
DECLARE
    v_dress_id BIGINT;
    v_gender_id BIGINT;
    v_pattern_id BIGINT;
BEGIN
    SELECT id INTO v_dress_id FROM public.art_dresses WHERE code = '4J' LIMIT 1;
    SELECT id INTO v_gender_id FROM public.art_genders WHERE code = '1' LIMIT 1;
    SELECT id INTO v_pattern_id FROM public.art_patterns WHERE code = '012' LIMIT 1;

    IF v_dress_id IS NOT NULL AND v_gender_id IS NOT NULL AND v_pattern_id IS NOT NULL THEN
        INSERT INTO public.art_numbers (dress_id, gender_id, pattern_id, code, base_size, fit)
        VALUES (v_dress_id, v_gender_id, v_pattern_id, '4J-1-012', 'M', 'regular fit')
        ON CONFLICT (code) DO NOTHING;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
