-- ==============================================================================
-- MIGRATION: Add GST & Delivery Address Columns to Organizations (Customers)
-- ==============================================================================

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS gst_number TEXT,
    ADD COLUMN IF NOT EXISTS pan_number TEXT,
    ADD COLUMN IF NOT EXISTS legal_name TEXT,
    ADD COLUMN IF NOT EXISTS delivery_address TEXT,
    ADD COLUMN IF NOT EXISTS delivery_city TEXT,
    ADD COLUMN IF NOT EXISTS delivery_state TEXT,
    ADD COLUMN IF NOT EXISTS delivery_pincode TEXT,
    ADD COLUMN IF NOT EXISTS delivery_country TEXT DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS is_b2b BOOLEAN DEFAULT false;

-- Auto-update is_b2b to true for any organization with existing gst_number
UPDATE public.organizations 
SET is_b2b = true 
WHERE gst_number IS NOT NULL AND TRIM(gst_number) <> '';

-- Refresh Supabase Schema Cache
NOTIFY pgrst, 'reload schema';
