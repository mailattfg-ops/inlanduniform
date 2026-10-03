-- Migration: 05 Add Corporate Approval Workflow to Orders Table
-- Supports PRD Phase 1 Branch-to-Corporate Order Triage (M5.5 - M5.9)

ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS corporate_action TEXT DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS corporate_reason TEXT,
  ADD COLUMN IF NOT EXISTS submitted_to_corporate_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corporate_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corporate_action_by BIGINT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
