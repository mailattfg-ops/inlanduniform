-- The live company_settings table was created by an older script (bank_account_no, bank_ifsc, qr_code_image).
-- The app reads/writes account_no, ifsc_code, branch_name, upi_id, website, qr_image -> saving failed with
-- "Could not find the 'account_no' column of 'company_settings'". Add the columns and carry existing values over.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS website     TEXT,
  ADD COLUMN IF NOT EXISTS account_no  TEXT,
  ADD COLUMN IF NOT EXISTS branch_name TEXT,
  ADD COLUMN IF NOT EXISTS ifsc_code   TEXT,
  ADD COLUMN IF NOT EXISTS upi_id      TEXT,
  ADD COLUMN IF NOT EXISTS qr_image    TEXT;

UPDATE public.company_settings SET
  account_no = COALESCE(account_no, bank_account_no),
  ifsc_code  = COALESCE(ifsc_code, bank_ifsc),
  qr_image   = COALESCE(qr_image, qr_code_image)
WHERE id = 1;

-- Payment voucher numbers (CP-IU..): the column was missing, so payments were saved without their voucher no.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS voucher_no TEXT;
CREATE INDEX IF NOT EXISTS payments_voucher_no_idx ON public.payments (voucher_no);

NOTIFY pgrst, 'reload schema';
