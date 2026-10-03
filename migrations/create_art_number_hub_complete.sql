-- ==============================================================================
-- FORMA APPARELS — COMPLETE ART NUMBER HUB MIGRATION SCRIPT
-- Target: Supabase PostgreSQL (SQL Editor)
-- Format: [Prefix]-[Gender][Pattern]-[Fit] (e.g. 4J-1012-R)
--
-- This script creates all 5 Art Number Hub tables, seeds standard master records,
-- configures foreign keys, enables RLS, and notifies PostgREST to reload its cache.
-- It is 100% IDEMPOTENT (safe to run multiple times).
-- ==============================================================================

-- 1. DRESS PREFIXES
CREATE TABLE IF NOT EXISTS public.art_dresses (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.art_dresses (code, name, description) VALUES
    ('4J', 'Cotton Shirt', 'Standard Cotton Shirts'),
    ('6B', 'Trousers', 'Standard Trousers'),
    ('5K', 'Blazer', 'Formal Blazers'),
    ('7M', 'Skirt', 'School & Corporate Skirts')
ON CONFLICT (code) DO NOTHING;

-- 2. GENDER CODES
CREATE TABLE IF NOT EXISTS public.art_genders (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- 3. PATTERN CODES
CREATE TABLE IF NOT EXISTS public.art_patterns (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.art_patterns (code, name) VALUES
    ('012', 'Striped'),
    ('045', 'Checkered')
ON CONFLICT (code) DO NOTHING;

-- 4. FITS MASTER
CREATE TABLE IF NOT EXISTS public.art_fits (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- 5. COMBINED ART NUMBERS
CREATE TABLE IF NOT EXISTS public.art_numbers (
    id BIGSERIAL PRIMARY KEY,
    dress_id BIGINT REFERENCES public.art_dresses(id) ON DELETE CASCADE,
    gender_id BIGINT REFERENCES public.art_genders(id) ON DELETE CASCADE,
    pattern_id BIGINT REFERENCES public.art_patterns(id) ON DELETE CASCADE,
    fit_id BIGINT REFERENCES public.art_fits(id) ON DELETE SET NULL,
    code TEXT UNIQUE NOT NULL,
    art_number TEXT,
    base_size TEXT DEFAULT NULL,
    fit TEXT DEFAULT NULL,
    description TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure all columns and foreign keys exist if the table was partially created
ALTER TABLE public.art_numbers
    ADD COLUMN IF NOT EXISTS dress_id BIGINT REFERENCES public.art_dresses(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS gender_id BIGINT REFERENCES public.art_genders(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS pattern_id BIGINT REFERENCES public.art_patterns(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS fit_id BIGINT REFERENCES public.art_fits(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS art_number TEXT,
    ADD COLUMN IF NOT EXISTS base_size TEXT,
    ADD COLUMN IF NOT EXISTS fit TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_art_numbers_code ON public.art_numbers(code);
CREATE INDEX IF NOT EXISTS idx_art_numbers_dress ON public.art_numbers(dress_id);
CREATE INDEX IF NOT EXISTS idx_art_numbers_gender ON public.art_numbers(gender_id);
CREATE INDEX IF NOT EXISTS idx_art_numbers_pattern ON public.art_numbers(pattern_id);
CREATE INDEX IF NOT EXISTS idx_art_numbers_fit ON public.art_numbers(fit_id);

-- Seed Default Art Number using Option 1 (4J-1012-R)
DO $$
DECLARE
    v_dress_id BIGINT;
    v_gender_id BIGINT;
    v_pattern_id BIGINT;
    v_fit_id BIGINT;
BEGIN
    SELECT id INTO v_dress_id FROM public.art_dresses WHERE code = '4J' LIMIT 1;
    SELECT id INTO v_gender_id FROM public.art_genders WHERE code = '1' LIMIT 1;
    SELECT id INTO v_pattern_id FROM public.art_patterns WHERE code = '012' LIMIT 1;
    SELECT id INTO v_fit_id FROM public.art_fits WHERE code = 'R' LIMIT 1;

    IF v_dress_id IS NOT NULL AND v_gender_id IS NOT NULL AND v_pattern_id IS NOT NULL THEN
        INSERT INTO public.art_numbers (dress_id, gender_id, pattern_id, fit_id, code, art_number, base_size, fit)
        VALUES (v_dress_id, v_gender_id, v_pattern_id, v_fit_id, '4J-1012-R', '4J-1012-R', 'M', 'Regular Fit')
        ON CONFLICT (code) DO NOTHING;
    END IF;
END $$;

-- 6. ROW LEVEL SECURITY (RLS) & PERMISSIONS
ALTER TABLE public.art_dresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_genders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_fits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.art_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on art_dresses" ON public.art_dresses;
CREATE POLICY "Allow all on art_dresses" ON public.art_dresses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on art_genders" ON public.art_genders;
CREATE POLICY "Allow all on art_genders" ON public.art_genders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on art_patterns" ON public.art_patterns;
CREATE POLICY "Allow all on art_patterns" ON public.art_patterns FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on art_fits" ON public.art_fits;
CREATE POLICY "Allow all on art_fits" ON public.art_fits FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on art_numbers" ON public.art_numbers;
CREATE POLICY "Allow all on art_numbers" ON public.art_numbers FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions to Supabase roles
GRANT ALL ON public.art_dresses TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.art_genders TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.art_patterns TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.art_fits TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.art_numbers TO postgres, anon, authenticated, service_role;

GRANT ALL ON SEQUENCE public.art_dresses_id_seq TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.art_genders_id_seq TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.art_patterns_id_seq TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.art_fits_id_seq TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.art_numbers_id_seq TO postgres, anon, authenticated, service_role;

-- Reload Supabase PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
