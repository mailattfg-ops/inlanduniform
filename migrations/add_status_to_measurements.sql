-- Add status column to measurements for approval workflow
ALTER TABLE measurements 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending',
ADD COLUMN IF NOT EXISTS reviewer_id BIGINT REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Update existing records to 'Approved'
UPDATE measurements SET status = 'Approved' WHERE status IS NULL;
