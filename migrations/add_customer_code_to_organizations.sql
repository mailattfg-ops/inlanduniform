-- Migration: Add customer_code, relationship_manager_id, and assigned_operator_id to public.organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS customer_code TEXT UNIQUE;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS relationship_manager_id BIGINT REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS assigned_operator_id BIGINT REFERENCES public.employees(id) ON DELETE SET NULL;

-- Backfill codes for existing organizations
DO $$
DECLARE
    r RECORD;
    cnt INT := 1;
BEGIN
    FOR r IN SELECT id FROM public.organizations WHERE customer_code IS NULL ORDER BY created_at ASC, id ASC LOOP
        UPDATE public.organizations 
        SET customer_code = 'CN' || lpad(cnt::text, 3, '0') 
        WHERE id = r.id;
        cnt := cnt + 1;
    END LOOP;
END $$;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
