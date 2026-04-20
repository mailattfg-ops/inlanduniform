-- Migration: Create Uniform Templates Table
CREATE TABLE IF NOT EXISTS uniform_templates (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    classes JSONB DEFAULT '[]', 
    boys_config JSONB DEFAULT '[]',
    girls_config JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE uniform_templates ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow public read for templates" ON uniform_templates FOR SELECT USING (true);
CREATE POLICY "Allow all for admins on templates" ON uniform_templates FOR ALL USING (true);
