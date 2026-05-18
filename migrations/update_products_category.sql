-- Add category to products table
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS category TEXT;
COMMENT ON COLUMN public.products.category IS 'top_wear, bottom_wear, accessory, etc.';

-- Update existing products if any
UPDATE public.products SET category = 'top_wear' WHERE category IS NULL;
