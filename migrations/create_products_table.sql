-- Migration: Create Products Table
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    art_number TEXT UNIQUE NOT NULL,
    gender TEXT,
    measurements JSONB DEFAULT '[]',
    materials TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Dynamic Policies (assuming admin management)
CREATE POLICY "Allow public read for products" ON products FOR SELECT USING (true);
CREATE POLICY "Allow all for admins on products" ON products FOR ALL USING (true);
