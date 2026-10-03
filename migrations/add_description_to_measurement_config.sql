-- ==============================================================================
-- MIGRATION: ADD DESCRIPTION / MEASURING GUIDE TO MEASUREMENT CONFIG
-- Allows tailors and staff to see clear anatomical measuring instructions
-- ==============================================================================

-- 1. Add description column to measurement_config
ALTER TABLE public.measurement_config 
ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Populate helpful standard descriptions for existing records (if currently empty)
UPDATE public.measurement_config 
SET description = 'From high-point shoulder beside collar straight down to desired bottom hem line.'
WHERE LOWER(label) = 'length' 
  AND (product_type_id IN (SELECT id FROM public.product_types WHERE LOWER(name) LIKE '%shirt%' OR LOWER(name) LIKE '%top%'))
  AND (description IS NULL OR description = '');

UPDATE public.measurement_config 
SET description = 'From top edge of waistband along the outer leg seam down to ankle / shoe top.'
WHERE LOWER(label) = 'length' 
  AND (product_type_id IN (SELECT id FROM public.product_types WHERE LOWER(name) LIKE '%trouser%' OR LOWER(name) LIKE '%pant%' OR LOWER(name) LIKE '%bottom%'))
  AND (description IS NULL OR description = '');

UPDATE public.measurement_config 
SET description = 'Fullest circumference around the chest/bust, directly under armpits with normal breathing.'
WHERE LOWER(label) IN ('chest', 'bust')
  AND (description IS NULL OR description = '');

UPDATE public.measurement_config 
SET description = 'Circumference around the waist where the waistband naturally rests, with one finger ease.'
WHERE LOWER(label) = 'waist'
  AND (description IS NULL OR description = '');

UPDATE public.measurement_config 
SET description = 'Fullest circumference around the buttocks/seat area with feet standing together.'
WHERE LOWER(label) IN ('seat', 'hip', 'seat / hip', 'hip / seat')
  AND (description IS NULL OR description = '');

UPDATE public.measurement_config 
SET description = 'From outer shoulder bone edge across upper back to opposite shoulder bone edge.'
WHERE LOWER(label) = 'shoulder'
  AND (description IS NULL OR description = '');

UPDATE public.measurement_config 
SET description = 'From outer shoulder seam down along arm to wrist bone (or mid-bicep for short sleeve).'
WHERE LOWER(label) LIKE '%sleeve%'
  AND (description IS NULL OR description = '');

UPDATE public.measurement_config 
SET description = 'Around the base of the neck with two fingers allowance for button closure comfort.'
WHERE LOWER(label) IN ('collar', 'neck')
  AND (description IS NULL OR description = '');

UPDATE public.measurement_config 
SET description = 'From crotch fork intersection straight down along inner seam to bottom hem.'
WHERE LOWER(label) = 'inseam'
  AND (description IS NULL OR description = '');

UPDATE public.measurement_config 
SET description = 'Full circumference (or flat width) across leg opening at ankle cuff.'
WHERE LOWER(label) IN ('bottom opening', 'bottom', 'leg opening')
  AND (description IS NULL OR description = '');
