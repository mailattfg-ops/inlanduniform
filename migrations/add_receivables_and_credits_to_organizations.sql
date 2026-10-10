-- Migration: Add receivables and credits to organizations (customers) table
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS receivables NUMERIC(14,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS credits NUMERIC(14,2) DEFAULT 0.00;

-- Update existing rows to have default 0.00 if NULL
UPDATE public.organizations SET receivables = 0.00 WHERE receivables IS NULL;
UPDATE public.organizations SET credits = 0.00 WHERE credits IS NULL;
