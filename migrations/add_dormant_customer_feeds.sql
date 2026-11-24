-- Dormant customer re-engagement: customers with no invoice for 6 months are re-added to Feeds
-- by the daily cron (/api/cron/dormant-customers). Idempotent: safe to run more than once.

-- 1. Mark auto-created feed entries and the last invoice date that triggered them
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS is_returning_customer BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS dormant_since DATE;

-- 2. At most one auto feed per customer per dormancy period (guards against double cron runs)
CREATE UNIQUE INDEX IF NOT EXISTS leads_dormant_customer_once
    ON public.leads (organization_id, dormant_since)
    WHERE is_returning_customer;

-- 3. Latest invoice date per customer
CREATE OR REPLACE VIEW public.organization_last_invoice AS
SELECT
    organization_id,
    MAX(COALESCE(invoice_date, created_at::DATE)) AS last_invoice_date
FROM public.invoices
WHERE organization_id IS NOT NULL
GROUP BY organization_id;

GRANT SELECT ON public.organization_last_invoice TO authenticated, service_role;

-- Reload PostgREST schema cache so the new columns/view are visible to the API
NOTIFY pgrst, 'reload schema';
