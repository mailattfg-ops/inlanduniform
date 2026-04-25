-- Create Audit Logs table for tracking system changes
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', etc.
    entity_type TEXT NOT NULL, -- 'member', 'organization', 'measurement', etc.
    entity_id TEXT, -- The ID of the record changed
    details JSONB, -- The delta or description of changes
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow viewing audit logs
CREATE POLICY "Enable read access for all users" ON audit_logs
    FOR SELECT
    USING (true);

-- Internal service role can insert
CREATE POLICY "Internal service insert" ON audit_logs
    FOR INSERT
    WITH CHECK (true);
