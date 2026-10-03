-- ==============================================================================
-- FORMA APPARELS ERP - AUTO-PO & MATERIAL DEFICIT PROCUREMENT TABLES
-- Ensures public.purchase_orders and public.purchase_order_items support both
-- fabrics and trims, with auto-trigger flags, unit prices, and sales order links.
-- ==============================================================================

-- 1. Create or alter public.purchase_orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id BIGSERIAL PRIMARY KEY,
    po_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    supplier_name TEXT DEFAULT 'Raw Materials Supplier',
    notes TEXT,
    is_auto_triggered BOOLEAN DEFAULT FALSE,
    total_amount NUMERIC(14,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist on purchase_orders
ALTER TABLE public.purchase_orders 
  ADD COLUMN IF NOT EXISTS po_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS supplier_name TEXT DEFAULT 'Raw Materials Supplier',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS is_auto_triggered BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sales_order_id BIGINT,
  ADD COLUMN IF NOT EXISTS vendor_id BIGINT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Create or alter public.purchase_order_items
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL DEFAULT 'fabric',
    fabric_id UUID,
    trim_id UUID,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist on purchase_order_items
ALTER TABLE public.purchase_order_items 
  ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'fabric',
  ADD COLUMN IF NOT EXISTS fabric_id UUID,
  ADD COLUMN IF NOT EXISTS trim_id UUID,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure fabric_id is NOT strictly mandatory so trims can be added
ALTER TABLE public.purchase_order_items 
  ALTER COLUMN fabric_id DROP NOT NULL;

-- 3. Ensure orders table tracks auto PO
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS auto_po_id BIGINT,
  ADD COLUMN IF NOT EXISTS material_status TEXT;

-- 4. Enable RLS and setup policies
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read for purchase_orders" ON public.purchase_orders;
CREATE POLICY "Allow public read for purchase_orders" ON public.purchase_orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations for purchase_orders" ON public.purchase_orders;
CREATE POLICY "Allow all operations for purchase_orders" ON public.purchase_orders FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read for purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "Allow public read for purchase_order_items" ON public.purchase_order_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all operations for purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "Allow all operations for purchase_order_items" ON public.purchase_order_items FOR ALL USING (true);

-- 5. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
