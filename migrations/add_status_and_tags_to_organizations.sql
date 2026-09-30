-- Migration: Add active status and special/risk classification tags to organizations (customers) table
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_special BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_risk BOOLEAN DEFAULT false;

-- Add check constraint ensuring special and risk are mutually exclusive
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS chk_special_or_risk_mutually_exclusive;
ALTER TABLE public.organizations 
  ADD CONSTRAINT chk_special_or_risk_mutually_exclusive 
  CHECK (NOT (is_special = true AND is_risk = true));

-- Set defaults for existing rows
UPDATE public.organizations SET is_active = true WHERE is_active IS NULL;
UPDATE public.organizations SET is_special = false WHERE is_special IS NULL;
UPDATE public.organizations SET is_risk = false WHERE is_risk IS NULL;

