-- ==============================================================================
-- MIGRATION: Add Credit Period and Invoice Relationships
-- ==============================================================================

-- 1. Add credit_period_days to organizations
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS credit_period_days INT DEFAULT 30;

-- 2. Add credit_period_days, due_date, sale_type, organization_id to invoices
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES public.organizations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS credit_period_days INT DEFAULT 30,
    ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS due_date DATE,
    ADD COLUMN IF NOT EXISTS sale_type TEXT DEFAULT 'bulk'; -- 'bulk' (from sales order) or 'retail' (manual counter sale)

-- 3. Populate due_date for any existing invoices
UPDATE public.invoices
SET credit_period_days = COALESCE(credit_period_days, 30),
    invoice_date = COALESCE(invoice_date, (created_at::DATE)),
    due_date = COALESCE(due_date, (COALESCE(invoice_date, created_at::DATE) + INTERVAL '30 days')::DATE)
WHERE due_date IS NULL;

-- 4. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
