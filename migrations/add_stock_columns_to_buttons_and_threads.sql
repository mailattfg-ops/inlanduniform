-- Migration: Add quantity and low_stock_threshold to buttons and threads tables
ALTER TABLE public.buttons
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(10, 2) DEFAULT 10.00;

ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(10, 2) DEFAULT 10.00;
