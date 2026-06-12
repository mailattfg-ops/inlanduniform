-- Add pdf_html column to quotations table
ALTER TABLE public.quotations 
  ADD COLUMN IF NOT EXISTS pdf_html TEXT DEFAULT NULL;
