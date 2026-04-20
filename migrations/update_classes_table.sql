-- Update classes table to separate grade and section
ALTER TABLE classes 
ADD COLUMN grade TEXT,
ADD COLUMN section TEXT;

-- Migration of existing data
UPDATE classes 
SET grade = split_part(name, '-', 1),
    section = split_part(name, '-', 2)
WHERE name IS NOT NULL AND grade IS NULL;
