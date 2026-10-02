-- ==============================================================================
-- DEFINITIVE COMPREHENSIVE MIGRATION: PAYMENTS & ORDERS INTEGRATION
-- Target DB: PostgreSQL / Supabase
-- Handles: Pre-existing tables by safely adding all missing columns first,
--          establishing foreign keys, performance indexes, RLS, and cache reload.
-- ==============================================================================

-- 1. Ensure extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Extend public.quotations with payment tracking fields
ALTER TABLE public.quotations 
ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Pending';

ALTER TABLE public.quotations 
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00;

-- 3. Create or Alter public.payments table
CREATE TABLE IF NOT EXISTS public.payments (
    id BIGSERIAL PRIMARY KEY,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safely add ALL required columns to public.payments (handles pre-existing legacy payments table)
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS quotation_id BIGINT REFERENCES public.quotations(id) ON DELETE CASCADE;

ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Cash';

ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS reference_no TEXT DEFAULT '';

ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Optional reference columns
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders') THEN
        ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL;
    ELSE
        ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS order_id BIGINT;
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'branches') THEN
        ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL;
    ELSE
        ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS branch_id BIGINT;
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
        ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL;
    ELSE
        ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS created_by BIGINT;
    END IF;
END $$;

-- Synchronize legacy column names if old rows exist (e.g. payment_mode -> payment_method, transaction_ref -> reference_no)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='payment_mode') THEN
        UPDATE public.payments 
        SET payment_method = payment_mode 
        WHERE (payment_method IS NULL OR payment_method = 'Cash') AND payment_mode IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='transaction_ref') THEN
        UPDATE public.payments 
        SET reference_no = transaction_ref 
        WHERE (reference_no IS NULL OR reference_no = '') AND transaction_ref IS NOT NULL;
    END IF;
END $$;

-- 4. Create or Alter public.orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id BIGSERIAL PRIMARY KEY,
    order_no TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safely add ALL required columns to public.orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS quotation_id BIGINT REFERENCES public.quotations(id) ON DELETE SET NULL;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS barcode TEXT;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Placed';

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS order_notes TEXT;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'branches') THEN
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL;
    ELSE
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS branch_id BIGINT;
    END IF;
END $$;

-- 5. Performance Indexes (only after all columns are guaranteed to exist)
CREATE INDEX IF NOT EXISTS idx_payments_quotation_id ON public.payments(quotation_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_payment_status ON public.quotations(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_quotation_id ON public.orders(quotation_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies (Idempotent: drops if exists then creates)
DROP POLICY IF EXISTS "Allow public read for payments" ON public.payments;
CREATE POLICY "Allow public read for payments" ON public.payments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations for payments" ON public.payments;
CREATE POLICY "Allow all operations for payments" ON public.payments FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read for orders" ON public.orders;
CREATE POLICY "Allow public read for orders" ON public.orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations for orders" ON public.orders;
CREATE POLICY "Allow all operations for orders" ON public.orders FOR ALL USING (true);

-- 8. Grants for Supabase Roles & Sequences
GRANT ALL ON TABLE public.payments TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.orders TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 9. Force PostgREST schema cache reload so the backend API recognizes the new schema immediately
NOTIFY pgrst, 'reload schema';
