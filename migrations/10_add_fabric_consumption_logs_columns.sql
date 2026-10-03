-- Migration: Add missing columns to fabric_consumption_logs
-- Run this in Supabase SQL Editor if upgrading existing tables

ALTER TABLE IF EXISTS public.fabric_consumption_logs
    ADD COLUMN IF NOT EXISTS sub_job_card_id BIGINT REFERENCES public.sub_job_cards(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS fabric_name TEXT,
    ADD COLUMN IF NOT EXISTS required_meters NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS safety_margin_meters NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS issued_meters NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS returned_meters NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS cut_piece_batch_no TEXT,
    ADD COLUMN IF NOT EXISTS created_by BIGINT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
