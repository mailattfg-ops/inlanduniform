-- Migration: Add alternative contact person fields to leads and organizations
-- Allows storing secondary contact name, designation, phone, and title for leads, feeds, and customers.

ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS alt_contact_title text DEFAULT 'Mr.',
  ADD COLUMN IF NOT EXISTS alt_contact_person text,
  ADD COLUMN IF NOT EXISTS alt_contact_designation text,
  ADD COLUMN IF NOT EXISTS alt_contact_number text,
  ADD COLUMN IF NOT EXISTS alt_phone text;

ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS alt_contact_title text DEFAULT 'Mr.',
  ADD COLUMN IF NOT EXISTS alt_contact_person text,
  ADD COLUMN IF NOT EXISTS alt_contact_designation text,
  ADD COLUMN IF NOT EXISTS alt_contact_number text,
  ADD COLUMN IF NOT EXISTS alt_phone text;
