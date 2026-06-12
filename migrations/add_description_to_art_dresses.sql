-- Migration: Add description column to public.art_dresses table
ALTER TABLE public.art_dresses ADD COLUMN IF NOT EXISTS description TEXT;
