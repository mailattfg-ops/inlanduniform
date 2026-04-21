-- Create Inventory tables for Admin Controls
CREATE TABLE IF NOT EXISTS fabrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buttons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS threads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS (Assuming Admin only access for now, but I'll add permissive defaults then restrict via API)
ALTER TABLE fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE buttons ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

-- Simple permissive policies for internal API use via Service Role
CREATE POLICY "Public Read" ON fabrics FOR SELECT USING (true);
CREATE POLICY "Public Read" ON buttons FOR SELECT USING (true);
CREATE POLICY "Public Read" ON threads FOR SELECT USING (true);

CREATE POLICY "Admin All" ON fabrics FOR ALL USING (true);
CREATE POLICY "Admin All" ON buttons FOR ALL USING (true);
CREATE POLICY "Admin All" ON threads FOR ALL USING (true);
