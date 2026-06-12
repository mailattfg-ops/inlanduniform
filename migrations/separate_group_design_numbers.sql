-- Migrate Group Design Numbers to a separate table and update prefixes to DNS- & DNG-

-- 1. Create group_design_numbers table
CREATE TABLE IF NOT EXISTS public.group_design_numbers (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Populate group_design_numbers from design_numbers
INSERT INTO public.group_design_numbers (id, code, created_at)
SELECT id, code, created_at 
FROM public.design_numbers 
WHERE type = 'Group Design'
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code;

-- 3. Update sequences for group_design_numbers
SELECT setval(pg_get_serial_sequence('public.group_design_numbers', 'id'), COALESCE((SELECT MAX(id)+1 FROM public.group_design_numbers), 1), false);

-- 4. Alter group_design_mappings table to point parent_id to group_design_numbers
ALTER TABLE public.group_design_mappings DROP CONSTRAINT IF EXISTS group_design_mappings_parent_id_fkey;
ALTER TABLE public.group_design_mappings 
  ADD CONSTRAINT group_design_mappings_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.group_design_numbers(id) ON DELETE CASCADE;

-- 5. Alter quotations table to point group_design_number_id to group_design_numbers
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_group_design_number_id_fkey;
ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_group_design_number_id_fkey FOREIGN KEY (group_design_number_id) REFERENCES public.group_design_numbers(id) ON DELETE SET NULL;

-- 6. Delete group designs from design_numbers and clean up design_numbers
DELETE FROM public.design_numbers WHERE type = 'Group Design';
ALTER TABLE public.design_numbers DROP COLUMN IF EXISTS type;

-- 7. Configure RLS and policies on group_design_numbers
ALTER TABLE public.group_design_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read" ON public.group_design_numbers;
DROP POLICY IF EXISTS "Admin All" ON public.group_design_numbers;
CREATE POLICY "Public Read" ON public.group_design_numbers FOR SELECT USING (true);
CREATE POLICY "Admin All" ON public.group_design_numbers FOR ALL USING (true);

-- 8. Convert DN- / GDN- prefixes to DNS- / DNG-
UPDATE public.design_numbers
SET code = REPLACE(code, 'DN-', 'DNS-')
WHERE code LIKE 'DN-%';

UPDATE public.group_design_numbers
SET code = REPLACE(REPLACE(code, 'DN-', 'DNG-'), 'GDN-', 'DNG-')
WHERE code LIKE 'DN-%' OR code LIKE 'GDN-%';
