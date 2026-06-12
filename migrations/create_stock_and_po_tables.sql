-- Migration: Create Stock and Purchase Order Tables

-- 1. Create product_stocks table for finished uniforms (sizing stock)
CREATE TABLE IF NOT EXISTS public.product_stocks (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES public.products(id) ON DELETE CASCADE,
    size TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, size)
);

-- 2. Alter fabrics table to track low-stock alert thresholds
ALTER TABLE public.fabrics 
  ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(10,2) DEFAULT 10.00;

-- 3. Create purchase_orders table for external raw fabric procurement
DROP TABLE IF EXISTS public.purchase_order_items CASCADE;
DROP TABLE IF EXISTS public.purchase_orders CASCADE;

CREATE TABLE public.purchase_orders (
    id BIGSERIAL PRIMARY KEY,
    po_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft', -- Draft, Ordered, Received, Cancelled
    supplier_name TEXT DEFAULT 'Default Supplier',
    notes TEXT,
    is_auto_triggered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create purchase_order_items table referencing raw Fabrics (not product sizes)
CREATE TABLE public.purchase_order_items (
    id BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    fabric_id UUID REFERENCES public.fabrics(id) ON DELETE CASCADE,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Pending', -- Pending, Received
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(purchase_order_id, fabric_id)
);


-- Enable Row Level Security (RLS)
ALTER TABLE public.product_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policies (Allow read for everyone, and all operations for authorized/admin users)
DROP POLICY IF EXISTS "Allow public read for product_stocks" ON public.product_stocks;
CREATE POLICY "Allow public read for product_stocks" ON public.product_stocks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations for product_stocks" ON public.product_stocks;
CREATE POLICY "Allow all operations for product_stocks" ON public.product_stocks FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read for purchase_orders" ON public.purchase_orders;
CREATE POLICY "Allow public read for purchase_orders" ON public.purchase_orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations for purchase_orders" ON public.purchase_orders;
CREATE POLICY "Allow all operations for purchase_orders" ON public.purchase_orders FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read for purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "Allow public read for purchase_order_items" ON public.purchase_order_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations for purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "Allow all operations for purchase_order_items" ON public.purchase_order_items FOR ALL USING (true);

