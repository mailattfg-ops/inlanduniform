-- ==============================================================================
-- FORMA APPARELS CRM: STANDARDIZE CONTACT PERSON, 5-PART ADDRESS & ORIGIN SYNC
-- Strict pincode standardization: drops legacy pin_code column across all tables
-- Target: PostgreSQL / Supabase
-- Safety: Completely Idempotent (IF NOT EXISTS / IF EXISTS), Zero Data Loss
-- ==============================================================================

-- 1. Extend public.leads table with standard columns
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS contact_number TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS contact_title TEXT DEFAULT 'Mr.',
    ADD COLUMN IF NOT EXISTS contact_designation TEXT,
    ADD COLUMN IF NOT EXISTS contact_person TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS pincode TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'BRANCH';

-- Synchronize phone and contact_number on public.leads
UPDATE public.leads
SET contact_number = COALESCE(contact_number, phone),
    phone = COALESCE(phone, contact_number);

-- 2. Extend public.organizations table with standard columns
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS contact_number TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS contact_title TEXT DEFAULT 'Mr.',
    ADD COLUMN IF NOT EXISTS contact_designation TEXT,
    ADD COLUMN IF NOT EXISTS contact_person TEXT,
    ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'BRANCH',
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS pincode TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';

-- Synchronize phone and contact_number on public.organizations
UPDATE public.organizations
SET contact_number = COALESCE(contact_number, phone),
    phone = COALESCE(phone, contact_number);

-- 3. Ensure pincode exists on branches and vendors if applicable
ALTER TABLE public.branches
    ADD COLUMN IF NOT EXISTS pincode TEXT;

ALTER TABLE public.vendors
    ADD COLUMN IF NOT EXISTS pincode TEXT;

-- 4. Migrate data from legacy "pin_code" column to "pincode" and drop "pin_code"
DO $$
BEGIN
    -- Sync and drop pin_code on public.leads
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'leads' 
          AND column_name = 'pin_code'
    ) THEN
        UPDATE public.leads SET pincode = COALESCE(pincode, pin_code);
        ALTER TABLE public.leads DROP COLUMN pin_code;
    END IF;

    -- Sync and drop pin_code on public.organizations
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'organizations' 
          AND column_name = 'pin_code'
    ) THEN
        UPDATE public.organizations SET pincode = COALESCE(pincode, pin_code);
        ALTER TABLE public.organizations DROP COLUMN pin_code;
    END IF;

    -- Sync and drop pin_code on public.branches if present
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'branches' 
          AND column_name = 'pin_code'
    ) THEN
        UPDATE public.branches SET pincode = COALESCE(pincode, pin_code);
        ALTER TABLE public.branches DROP COLUMN pin_code;
    END IF;

    -- Sync and drop pin_code on public.vendors if present
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'vendors' 
          AND column_name = 'pin_code'
    ) THEN
        UPDATE public.vendors SET pincode = COALESCE(pincode, pin_code);
        ALTER TABLE public.vendors DROP COLUMN pin_code;
    END IF;

    -- Sync and drop redundant contact_phone on public.organizations if present
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'organizations' 
          AND column_name = 'contact_phone'
    ) THEN
        UPDATE public.organizations SET contact_number = COALESCE(contact_number, contact_phone);
        ALTER TABLE public.organizations DROP COLUMN contact_phone;
    END IF;
END $$;

-- 5. Auto-repair any quotations where final_quote_value was saved as 0 or NULL
UPDATE public.quotations
SET final_quote_value = ROUND((
    COALESCE(
        (metrics_summary->>'pre_tax_subtotal')::numeric, 
        estimated_expenses, 
        0
    ) + 
    COALESCE(
        (metrics_summary->>'tax_amount')::numeric, 
        ((COALESCE((metrics_summary->>'pre_tax_subtotal')::numeric, estimated_expenses, 0)) * COALESCE((metrics_summary->>'gst_percent')::numeric, 0) / 100),
        0
    )
)::numeric, 2)
WHERE (final_quote_value IS NULL OR final_quote_value = 0)
  AND (
      (metrics_summary->>'pre_tax_subtotal')::numeric > 0 
      OR estimated_expenses > 0
  );

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
