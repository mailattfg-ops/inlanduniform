const supabase = require('../config/supabase');
const { logAction } = require('../utils/logger');

exports.getSettings = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('❌ [DATABASE ERROR] Table "company_settings" query failed:');
      console.error('  Code:', error.code, '| Message:', error.message);
      if (error.code === '42P01') {
        console.error('  Hint: Table public.company_settings is missing in database.');
      }
      return res.status(500).json({ error: error.message, code: error.code });
    }

    // Live data directly from database! If table is blank, return null
    res.json({ success: true, data: data || null });
  } catch (err) {
    console.error('❌ [DATABASE ERROR] getSettings exception:', err.message);
    res.status(500).json({ error: err.message });
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
    upi_id,
    qr_image
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
        qr_image,
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
