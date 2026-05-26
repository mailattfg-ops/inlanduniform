-- Migration: Add unit_price column to buttons and threads tables
ALTER TABLE public.buttons
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10, 2) DEFAULT NULL;

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10, 2) DEFAULT NULL;
