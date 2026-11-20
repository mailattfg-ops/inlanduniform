-- ==============================================================================
-- FORMA APPARELS — ITEMS & SPECIFICATIONS MIGRATION SCRIPT
-- Format: [item][specification]-[gender][pattern-code]-[R][allowance]
-- Example: 1A-3053-R2
--
-- 1 = item, A = specification, 3 = gender, 053 = pattern code, R = fit, 2 = allowance
-- ==============================================================================

-- 1. ART ITEMS TABLE (Master Garment Items)
CREATE TABLE IF NOT EXISTS public.art_items (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    product_type_id BIGINT REFERENCES public.product_types(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure all columns exist if table was already created
ALTER TABLE public.art_items
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS product_type_id BIGINT REFERENCES public.product_types(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_art_items_code ON public.art_items(code);

-- Copy existing records from art_dresses if available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'art_dresses') THEN
        INSERT INTO public.art_items (code, name, description, created_at, updated_at)
        SELECT code, name, description, created_at, updated_at FROM public.art_dresses
        ON CONFLICT (code) DO NOTHING;
    END IF;
END $$;

-- Seed standard items (1: Shirt, 2: Trouser, 3: Blazer, 4: T-Shirt, 5: Skirt)
INSERT INTO public.art_items (code, name, description) VALUES
    ('1', 'Shirt', 'Formal, corporate and school shirts'),
    ('2', 'Trouser', 'Standard formal and uniform trousers'),
    ('3', 'Blazer', 'Formal blazers and coats'),
    ('4', 'T-Shirt', 'Round neck and polo knitted shirts'),
    ('5', 'Skirt', 'School and corporate skirts')
ON CONFLICT (code) DO NOTHING;

-- Link art_items to product_types where names match
UPDATE public.art_items ai
SET product_type_id = pt.id
FROM public.product_types pt
WHERE LOWER(TRIM(ai.name)) = LOWER(TRIM(pt.name))
  AND ai.product_type_id IS NULL;


-- 2. ART ITEM SPECIFICATIONS TABLE (Each Item's Specific Specifications e.g. Half Sleeve, Full Sleeve)
CREATE TABLE IF NOT EXISTS public.art_item_specifications (
    id BIGSERIAL PRIMARY KEY,
    item_id BIGINT NOT NULL REFERENCES public.art_items(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_art_item_spec UNIQUE (item_id, code)
);

ALTER TABLE public.art_item_specifications
    ADD COLUMN IF NOT EXISTS item_id BIGINT REFERENCES public.art_items(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_art_item_specs_item_id ON public.art_item_specifications(item_id);
CREATE INDEX IF NOT EXISTS idx_art_item_specs_code ON public.art_item_specifications(code);

-- Seed initial specifications for Item 1 (Shirt)
DO $$
DECLARE
    v_shirt_item_id BIGINT;
    v_trouser_item_id BIGINT;
BEGIN
    SELECT id INTO v_shirt_item_id FROM public.art_items WHERE code = '1' LIMIT 1;
    IF v_shirt_item_id IS NOT NULL THEN
        INSERT INTO public.art_item_specifications (item_id, code, name, description, display_order) VALUES
            (v_shirt_item_id, 'A', 'Half Sleeve', 'Short / Half sleeve styling with hemmed cuff', 1),
            (v_shirt_item_id, 'B', 'Full Sleeve', 'Long / Full sleeve styling with buttoned cuff', 2),
            (v_shirt_item_id, 'C', 'Sleeveless', 'Sleeveless styling', 3)
        ON CONFLICT (item_id, code) DO NOTHING;
    END IF;

    SELECT id INTO v_trouser_item_id FROM public.art_items WHERE code = '2' LIMIT 1;
    IF v_trouser_item_id IS NOT NULL THEN
        INSERT INTO public.art_item_specifications (item_id, code, name, description, display_order) VALUES
            (v_trouser_item_id, 'A', 'Full Length Pleated', 'Classic pleated regular cut trousers', 1),
            (v_trouser_item_id, 'B', 'Flat Front', 'Modern flat front no-pleat trousers', 2),
            (v_trouser_item_id, 'C', 'Shorts', 'School or sportswear uniform shorts', 3)
        ON CONFLICT (item_id, code) DO NOTHING;
    END IF;
END $$;


-- 3. UPDATE ART_NUMBERS TABLE
ALTER TABLE public.art_numbers
    ADD COLUMN IF NOT EXISTS item_id BIGINT REFERENCES public.art_items(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS specification_id BIGINT REFERENCES public.art_item_specifications(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS allowance TEXT;

CREATE INDEX IF NOT EXISTS idx_art_numbers_item_id ON public.art_numbers(item_id);
CREATE INDEX IF NOT EXISTS idx_art_numbers_spec_id ON public.art_numbers(specification_id);


-- 4. UPDATE PRODUCTS TABLE
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS item_id BIGINT REFERENCES public.art_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS specification_id BIGINT REFERENCES public.art_item_specifications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_item_id ON public.products(item_id);
CREATE INDEX IF NOT EXISTS idx_products_spec_id ON public.products(specification_id);


-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.art_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on art_items" ON public.art_items;
CREATE POLICY "Allow all on art_items" ON public.art_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.art_item_specifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on art_item_specifications" ON public.art_item_specifications;
CREATE POLICY "Allow all on art_item_specifications" ON public.art_item_specifications FOR ALL USING (true) WITH CHECK (true);


-- 6. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
