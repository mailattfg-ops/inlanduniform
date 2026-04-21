-- Create Designs table
CREATE TABLE IF NOT EXISTS designs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    design_code TEXT UNIQUE NOT NULL,
    main_fabric_id UUID REFERENCES fabrics(id),
    attachment_fabric1_id UUID REFERENCES fabrics(id),
    attachment_fabric2_id UUID REFERENCES fabrics(id),
    button_id UUID REFERENCES buttons(id),
    thread_id UUID REFERENCES threads(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read" ON designs FOR SELECT USING (true);
CREATE POLICY "Admin All" ON designs FOR ALL USING (true);
