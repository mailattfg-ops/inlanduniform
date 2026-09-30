-- ==============================================================================
-- MIGRATION: PRODUCT-TYPE-SCOPED MEASUREMENT CONFIGURATIONS
-- Allows measurements to be linked to specific Product Types (e.g. Shirt, Trouser)
-- ==============================================================================

-- 1. Add product_type_id foreign key column to measurement_config
ALTER TABLE public.measurement_config 
ADD COLUMN IF NOT EXISTS product_type_id BIGINT REFERENCES public.product_types(id) ON DELETE CASCADE;

-- 2. Drop the global unique constraint on label so the same label (e.g. 'Length') can exist for different product types
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'measurement_config_label_key' 
          AND conrelid = 'public.measurement_config'::regclass
    ) THEN
        ALTER TABLE public.measurement_config DROP CONSTRAINT measurement_config_label_key;
    END IF;
END $$;

-- 3. Create composite unique index for (label, product_type_id)
-- Treats NULL product_type_id as -1 for uniqueness of universal metrics
CREATE UNIQUE INDEX IF NOT EXISTS uq_measurement_config_label_type 
ON public.measurement_config (label, COALESCE(product_type_id, -1));

-- 4. Index for high-performance lookup by product_type_id
CREATE INDEX IF NOT EXISTS idx_measurement_config_product_type 
ON public.measurement_config(product_type_id);

-- Optional: Seed/associate existing standard metrics if product_types exist
DO $$
DECLARE
    v_shirt_id BIGINT;
    v_trouser_id BIGINT;
    v_blazer_id BIGINT;
BEGIN
    SELECT id INTO v_shirt_id FROM public.product_types WHERE LOWER(name) LIKE '%shirt%' LIMIT 1;
    SELECT id INTO v_trouser_id FROM public.product_types WHERE LOWER(name) LIKE '%trouser%' OR LOWER(name) LIKE '%pant%' LIMIT 1;
    SELECT id INTO v_blazer_id FROM public.product_types WHERE LOWER(name) LIKE '%blazer%' OR LOWER(name) LIKE '%coat%' LIMIT 1;

    -- If product types exist, seed sample metrics cleanly
    IF v_shirt_id IS NOT NULL THEN
        INSERT INTO public.measurement_config (label, unit, display_order, is_required, product_type_id)
        VALUES 
            ('Length', 'Inches', 1, true, v_shirt_id),
            ('Chest', 'Inches', 2, true, v_shirt_id),
            ('Shoulder', 'Inches', 3, true, v_shirt_id),
            ('Sleeve Length', 'Inches', 4, true, v_shirt_id),
            ('Collar', 'Inches', 5, false, v_shirt_id)
        ON CONFLICT (label, COALESCE(product_type_id, -1)) DO NOTHING;
    END IF;

    IF v_trouser_id IS NOT NULL THEN
        INSERT INTO public.measurement_config (label, unit, display_order, is_required, product_type_id)
        VALUES 
            ('Length', 'Inches', 1, true, v_trouser_id),
            ('Waist', 'Inches', 2, true, v_trouser_id),
            ('Seat / Hip', 'Inches', 3, true, v_trouser_id),
            ('Inseam', 'Inches', 4, false, v_trouser_id),
            ('Bottom Opening', 'Inches', 5, false, v_trouser_id)
        ON CONFLICT (label, COALESCE(product_type_id, -1)) DO NOTHING;
    END IF;
END $$;
