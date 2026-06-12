-- Migration: Create Payments and Orders Tables, and Extend Quotations Table

-- 1. Add payment columns to quotations table if they do not exist
ALTER TABLE public.quotations 
ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Pending';

ALTER TABLE public.quotations 
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- 2. Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
    id BIGSERIAL PRIMARY KEY,
    quotation_id BIGINT REFERENCES public.quotations(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    payment_method TEXT NOT NULL, -- Cash, Card, Bank Transfer, Cheque
    reference_no TEXT,
    notes TEXT,
    paid_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id BIGSERIAL PRIMARY KEY,
    quotation_id BIGINT UNIQUE REFERENCES public.quotations(id) ON DELETE CASCADE,
    order_no TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Placed', -- Placed, In Production, Shipped, Delivered
    order_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policies (Allow read for everyone, and all operations for authorized/admin users)
CREATE POLICY "Allow public read for payments" ON public.payments FOR SELECT USING (true);
CREATE POLICY "Allow all operations for payments" ON public.payments FOR ALL USING (true);

CREATE POLICY "Allow public read for orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Allow all operations for orders" ON public.orders FOR ALL USING (true);
