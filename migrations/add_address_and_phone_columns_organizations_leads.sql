-- ==============================================================================
-- MIGRATION: Add Address Split-up & Phone Columns (Clean Schema - Single Pincode)
-- ==============================================================================

-- 1. "organizations" TABLE: Add missing columns and unify phone to "contact_number"
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS contact_number TEXT,
    ADD COLUMN IF NOT EXISTS contact_email TEXT,
    ADD COLUMN IF NOT EXISTS contact_person TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS pincode TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS relationship_manager_id BIGINT REFERENCES public.employees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_special BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_risk BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS client_tag TEXT DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS receivables NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS credits NUMERIC(12,2) DEFAULT 0.00;

-- Migrate data from "contact_phone" or legacy "phone" to unified "contact_number", then drop them
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'organizations' 
          AND column_name = 'contact_phone'
    ) THEN
        UPDATE public.organizations SET contact_number = COALESCE(contact_number, contact_phone);
        ALTER TABLE public.organizations DROP COLUMN contact_phone;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'organizations' 
          AND column_name = 'phone'
    ) THEN
        UPDATE public.organizations SET contact_number = COALESCE(contact_number, phone);
        ALTER TABLE public.organizations DROP COLUMN phone;
    END IF;
END $$;

-- Migrate data from duplicate "pin_code" column if it exists, then drop it
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'organizations' 
          AND column_name = 'pin_code'
    ) THEN
        UPDATE public.organizations SET pincode = COALESCE(pincode, pin_code);
        ALTER TABLE public.organizations DROP COLUMN pin_code;
    END IF;
END $$;

-- 2. "leads" TABLE: Add missing columns
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS contact_number TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS pincode TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS remarks JSONB DEFAULT '[]'::jsonb;

-- Migrate data from duplicate "phone" column to "contact_number", then drop redundant "phone"
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'leads' 
          AND column_name = 'phone'
    ) THEN
        UPDATE public.leads SET contact_number = COALESCE(contact_number, phone);
        ALTER TABLE public.leads DROP COLUMN phone;
    END IF;
END $$;

-- 3. REFRESH SUPABASE SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
