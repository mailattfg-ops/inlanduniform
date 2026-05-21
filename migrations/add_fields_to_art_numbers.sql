-- Migration: Add base_size and fit columns to art_numbers table
ALTER TABLE public.art_numbers
  ADD COLUMN IF NOT EXISTS base_size TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fit TEXT DEFAULT NULL; -- e.g. 'regular_fit', 'slim_fit'
