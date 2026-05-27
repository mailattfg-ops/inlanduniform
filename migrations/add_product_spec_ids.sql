-- Migration: Add main_fabric_id, button_id, and thread_id back to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS main_fabric_id UUID REFERENCES public.fabrics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS button_id UUID REFERENCES public.buttons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL;
