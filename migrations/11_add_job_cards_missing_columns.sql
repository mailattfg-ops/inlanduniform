-- Migration: Add missing columns to job_cards table
-- Run this in Supabase SQL Editor if upgrading existing tables

ALTER TABLE IF EXISTS public.job_cards
    ADD COLUMN IF NOT EXISTS quotation_id BIGINT REFERENCES public.quotations(id),
    ADD COLUMN IF NOT EXISTS item_id BIGINT,
    ADD COLUMN IF NOT EXISTS design_number TEXT,
    ADD COLUMN IF NOT EXISTS item_name TEXT DEFAULT 'Production Item',
    ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS size_breakdown JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS po_handler_action TEXT DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS po_handler_reason TEXT,
    ADD COLUMN IF NOT EXISTS hold_reason TEXT,
    ADD COLUMN IF NOT EXISTS created_by BIGINT;
