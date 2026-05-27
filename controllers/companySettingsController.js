const supabase = require('../config/supabase');
const { logAction } = require('../utils/logger');

// Fallback hardcoded defaults from user specification
const DEFAULT_SETTINGS = {
  id: 1,
  company_name: 'Forma Apparels',
  address: '63/3608, CD Tower, Arayidathupalam, Kozhikode, Kerala - 673 004, India',
  phone: '(+91) 7902 499 990 | 0495 2 922 992',
  email: 'info@formaapparels.com',
  website: 'www.formaapparels.com',
  bank_name: 'HDFC BANK',
  account_no: '50200076116064',
  branch_name: 'MAJESTIC CENTER',
  ifsc_code: 'HDFC0001255',
  upi_id: '7902 499 991'
};

exports.getSettings = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.warn('[DB Settings] Fallback active due to query error:', error.message);
      return res.json({ success: true, data: DEFAULT_SETTINGS, isFallback: true });
    }

    if (!data) {
      // Table exists but row is empty, return default
      return res.json({ success: true, data: DEFAULT_SETTINGS });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.warn('[DB Settings] Catch error fallback:', err.message);
    res.json({ success: true, data: DEFAULT_SETTINGS, isFallback: true });
  }
};

exports.updateSettings = async (req, res) => {
  const {
    company_name,
    address,
    phone,
    email,
    website,
    bank_name,
    account_no,
    branch_name,
    ifsc_code,
    upi_id
  } = req.body;

  try {
    const { data, error } = await supabase
      .from('company_settings')
      .upsert({
        id: 1,
        company_name,
        address,
        phone,
        email,
        website,
        bank_name,
        account_no,
        branch_name,
        ifsc_code,
        upi_id,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Log action if logger is accessible
    try {
      await logAction(req.user.id, 'UPDATE', 'company_settings', 1, { company_name });
    } catch (e) {
      console.warn('Logger failed:', e.message);
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
