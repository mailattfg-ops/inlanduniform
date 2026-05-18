-- Update products table to support entry methods and chart linking
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS entry_methods JSONB DEFAULT '["manual"]'::jsonb,
ADD COLUMN IF NOT EXISTS size_chart_id UUID REFERENCES public.size_charts(id) ON DELETE SET NULL;
