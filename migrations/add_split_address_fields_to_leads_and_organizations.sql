-- Migration: Add split address fields (city, state, pincode, pin_code, country) to leads and organizations
-- Enables granular address tracking across both prospects (leads) and active client accounts (organizations)

-- 1. Alter public.leads
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS pincode TEXT,
    ADD COLUMN IF NOT EXISTS pin_code TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';

-- 2. Alter public.organizations
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS pincode TEXT,
    ADD COLUMN IF NOT EXISTS pin_code TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';

-- 3. Sync PostgREST schema cache
NOTIFY pgrst, 'reload schema';
