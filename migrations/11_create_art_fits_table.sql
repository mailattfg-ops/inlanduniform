-- ==============================================================================
-- MIGRATION: CREATE ART_FITS TABLE & UPDATE ART_NUMBERS
-- Target: Supabase PostgreSQL
-- Format: Prefix-GenderPattern-Fit (e.g. 4J-1012-R)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.art_fits (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed Standard Fits: Slim Fit (S), Regular Fit (R), Loose Fit (L)
INSERT INTO public.art_fits (code, name) VALUES
    ('S', 'Slim Fit'),
    ('R', 'Regular Fit'),
    ('L', 'Loose Fit')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- Add fit_id foreign key to art_numbers
ALTER TABLE public.art_numbers
    ADD COLUMN IF NOT EXISTS fit_id BIGINT REFERENCES public.art_fits(id) ON DELETE SET NULL;

-- Enable RLS and grant permissions
ALTER TABLE public.art_fits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on art_fits" ON public.art_fits;
CREATE POLICY "Allow all operations on art_fits" ON public.art_fits FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.art_fits TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.art_fits_id_seq TO postgres, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
