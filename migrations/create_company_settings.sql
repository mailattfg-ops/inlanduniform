-- Create company_settings table for address and bank details
CREATE TABLE IF NOT EXISTS public.company_settings (
    id INT PRIMARY KEY DEFAULT 1,
    company_name TEXT DEFAULT 'Forma Apparels',
    address TEXT DEFAULT '63/3608, CD Tower, Arayidathupalam, Kozhikode, Kerala - 673 004, India',
    phone TEXT DEFAULT '(+91) 7902 499 990 | 0495 2 922 992',
    email TEXT DEFAULT 'info@formaapparels.com',
    website TEXT DEFAULT 'www.formaapparels.com',
    bank_name TEXT DEFAULT 'HDFC BANK',
    account_no TEXT DEFAULT '50200076116064',
    branch_name TEXT DEFAULT 'MAJESTIC CENTER',
    ifsc_code TEXT DEFAULT 'HDFC0001255',
    upi_id TEXT DEFAULT '7902 499 991',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT one_row CHECK (id = 1) -- ensures only one configuration row
);

-- Insert default details
INSERT INTO public.company_settings (id, company_name)
VALUES (1, 'Forma Apparels')
ON CONFLICT (id) DO NOTHING;
