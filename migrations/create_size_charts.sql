-- Create Size Charts Table
CREATE TABLE IF NOT EXISTS public.size_charts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL, -- e.g. "Casual Trousers", "Casual Shirts"
    category TEXT NOT NULL, -- "top_wear", "bottom_wear"
    unit TEXT DEFAULT 'cm', -- 'cm' or 'in'
    chart_data JSONB DEFAULT '[]'::jsonb, -- Legacy support
    metric_groups JSONB DEFAULT '[]'::jsonb, -- Array of objects: [{label: 'Chest', data: [{size: 'XS', value: '81-86'}]}]
    fit_types JSONB DEFAULT '[]'::jsonb, -- Array of objects: [{type: 'Slim Fit', description: '...', image: '...'}]
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.size_charts ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Enable all access for authenticated users" ON public.size_charts
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
