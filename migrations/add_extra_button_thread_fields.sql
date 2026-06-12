-- Migration: Add description to buttons table; type and description to threads table
ALTER TABLE public.buttons
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;
