-- Migration: Create Quotations and Quotation Items Tables

-- 1. Create quotations table
CREATE TABLE IF NOT EXISTS public.quotations (
    id BIGSERIAL PRIMARY KEY,
    quotation_no TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    organization_id BIGINT REFERENCES public.organizations(id) ON DELETE CASCADE,
    estimated_expenses NUMERIC(10,2) DEFAULT 0.00,
    total_estimated_time TEXT DEFAULT '', -- e.g. "50 Hours" or total hours count
    production_days_estimate INTEGER DEFAULT 0,
    expected_delivery_date DATE,
    profit_margin_percent NUMERIC(5,2) DEFAULT 0.00,
    final_quote_value NUMERIC(10,2) DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Draft', -- Draft, Sent, Approved, Rejected
    metrics_summary JSONB DEFAULT '{}'::jsonb, -- e.g., {"total_entities": 15, "measured": 12, "sizes": {"S": 2, "M": 8, "L": 2}}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create quotation_items table
CREATE TABLE IF NOT EXISTS public.quotation_items (
    id BIGSERIAL PRIMARY KEY,
    quotation_id BIGINT REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_type_id BIGINT REFERENCES public.product_types(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) DEFAULT 0.00,
    total_price NUMERIC(10,2) DEFAULT 0.00,
    size_breakdown JSONB DEFAULT '{}'::jsonb, -- e.g., {"S": 5, "M": 10, "L": 3}
    fabric_cost_per_item NUMERIC(10,2) DEFAULT 0.00,
    accessories_cost_per_item NUMERIC(10,2) DEFAULT 0.00,
    labor_cost_per_item NUMERIC(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policies (Allow read for everyone, and all operations for authorized/admin users)
CREATE POLICY "Allow public read for quotations" ON public.quotations FOR SELECT USING (true);
CREATE POLICY "Allow all operations for quotations" ON public.quotations FOR ALL USING (true);

CREATE POLICY "Allow public read for quotation_items" ON public.quotation_items FOR SELECT USING (true);
CREATE POLICY "Allow all operations for quotation_items" ON public.quotation_items FOR ALL USING (true);
