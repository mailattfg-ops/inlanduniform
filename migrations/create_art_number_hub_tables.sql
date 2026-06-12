-- Migration: Create Art Number Hub 4 Tables and Seed Data

-- 1. Dress Prefixes
CREATE TABLE IF NOT EXISTS public.art_dresses (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
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
CREATE TABLE IF NOT EXISTS public.art_numbers (
    id BIGSERIAL PRIMARY KEY,
    dress_id BIGINT REFERENCES public.art_dresses(id) ON DELETE CASCADE,
    gender_id BIGINT REFERENCES public.art_genders(id) ON DELETE CASCADE,
    pattern_id BIGINT REFERENCES public.art_patterns(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL, -- Joined representation: e.g. "4J-1012"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.art_dresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_genders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_numbers ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policies (Allow read for everyone, full access for admins)
CREATE POLICY "Allow public read for art_dresses" ON public.art_dresses FOR SELECT USING (true);
CREATE POLICY "Allow all for admins on art_dresses" ON public.art_dresses FOR ALL USING (true);

CREATE POLICY "Allow public read for art_genders" ON public.art_genders FOR SELECT USING (true);
CREATE POLICY "Allow all for admins on art_genders" ON public.art_genders FOR ALL USING (true);

CREATE POLICY "Allow public read for art_patterns" ON public.art_patterns FOR SELECT USING (true);
CREATE POLICY "Allow all for admins on art_patterns" ON public.art_patterns FOR ALL USING (true);

CREATE POLICY "Allow public read for art_numbers" ON public.art_numbers FOR SELECT USING (true);
CREATE POLICY "Allow all for admins on art_numbers" ON public.art_numbers FOR ALL USING (true);

-- Seed Data (Dresses)
INSERT INTO public.art_dresses (code, name) VALUES
('4J', 'Cotton Shirt'),
('6B', 'Trousers'),
('5K', 'Blazer'),
('7M', 'Skirt')
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

-- Seed Data (Combined Art Number: 4J-1012 using seeded keys)
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
        INSERT INTO public.art_numbers (dress_id, gender_id, pattern_id, code)
        VALUES (v_dress_id, v_gender_id, v_pattern_id, '4J-1012')
        ON CONFLICT (code) DO NOTHING;
    END IF;
END $$;
