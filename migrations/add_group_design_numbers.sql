-- Create Group Design Numbers tables and modify quotations

-- 1. Create design_numbers table
CREATE TABLE IF NOT EXISTS public.design_numbers (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Design', 'Group Design')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create group_design_mappings table
CREATE TABLE IF NOT EXISTS public.group_design_mappings (
    id BIGSERIAL PRIMARY KEY,
    parent_id BIGINT REFERENCES public.design_numbers(id) ON DELETE CASCADE,
    child_id BIGINT REFERENCES public.design_numbers(id) ON DELETE CASCADE,
    UNIQUE(parent_id, child_id)
);

-- 3. Add column to quotations
ALTER TABLE public.quotations 
  ADD COLUMN IF NOT EXISTS group_design_number_id BIGINT REFERENCES public.design_numbers(id) ON DELETE SET NULL;

-- 4. Enable RLS
ALTER TABLE public.design_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_design_mappings ENABLE ROW LEVEL SECURITY;

-- 5. Policies
DROP POLICY IF EXISTS "Public Read" ON public.design_numbers;
DROP POLICY IF EXISTS "Admin All" ON public.design_numbers;
CREATE POLICY "Public Read" ON public.design_numbers FOR SELECT USING (true);
CREATE POLICY "Admin All" ON public.design_numbers FOR ALL USING (true);

DROP POLICY IF EXISTS "Public Read" ON public.group_design_mappings;
DROP POLICY IF EXISTS "Admin All" ON public.group_design_mappings;
CREATE POLICY "Public Read" ON public.group_design_mappings FOR SELECT USING (true);
CREATE POLICY "Admin All" ON public.group_design_mappings FOR ALL USING (true);

-- 6. Insert existing product design numbers
INSERT INTO public.design_numbers (code, type)
SELECT DISTINCT design_number, 'Design'
FROM public.products
WHERE design_number IS NOT NULL AND design_number <> ''
ON CONFLICT (code) DO NOTHING;

-- 7. Add design_number_id column to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS design_number_id BIGINT REFERENCES public.design_numbers(id) ON DELETE SET NULL;

-- 8. Populate design_number_id in products table
UPDATE public.products p
SET design_number_id = dn.id
FROM public.design_numbers dn
WHERE p.design_number = dn.code AND dn.type = 'Design';

-- 9. Drop legacy design_number column from products table
ALTER TABLE public.products 
  DROP COLUMN IF EXISTS design_number;

