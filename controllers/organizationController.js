const supabase = require('../config/supabase');
const crypto = require('crypto');
const { logAction } = require('../utils/logger');

const generatePassword = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// --- Organizations Management ---

exports.getOrganizations = async (req, res) => {
  try {
    const { industryId } = req.query;
    let query = supabase
      .from('organizations')
      .select('*, industries(name)')
      .order('created_at', { ascending: false });

    if (industryId) {
      query = query.eq('industry_id', industryId);
    }

    const { data, error } = await query;

    if (error) throw error;
    console.log(`[DB] Fetched ${data.length} organizations`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createOrganization = async (req, res) => {
  const { name, address, username, password, industry_id } = req.body;
  
  try {
    // 1. Validate credentials if provided
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required for organization registration.' });
    }

    // 2. Create User Profile first
    // In multi-industry, we can still use the same role ID or create a generic 'ORG_ADMIN' role
    const ORG_ROLE_ID = '3e8ef077-f264-44b3-b37e-74e98fb6c0e7'; 
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .insert([{
        full_name: name,
        username: username,
        email: username,
        password: password,
        user_type_id: ORG_ROLE_ID
      }])
      .select()
      .single();

    if (userError) throw userError;

    // 3. Create Organization and link to user
    const { data, error } = await supabase
      .from('organizations')
      .insert([{ 
        name, 
        address, 
        user_id: userData.id,
        industry_id: industry_id || 1 // Default to 1 (School) for backward compatibility
      }])
      .select()
      .single();

    if (error) {
      await supabase.from('user_profiles').delete().eq('id', userData.id);
      throw error;
    }

    // 4. Log the action
    await logAction(req.user.id, 'CREATE', 'organization', data.id, { name: data.name });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateOrganization = async (req, res) => {
    const { id } = req.params;
    const { name, address, industry_id } = req.body;
    try {
      const { data, error } = await supabase
        .from('organizations')
        .update({ name, address, industry_id })
        .eq('id', id)
        .select()
        .single();
  
      if (error) throw error;

      // 2. Log the action
      await logAction(req.user.id, 'UPDATE', 'organization', id, { updated_name: name });

      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

exports.deleteOrganization = async (req, res) => {
    const { id } = req.params;
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('user_id')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', id);
  
      if (error) throw error;

      if (org?.user_id) {
        await supabase.from('user_profiles').delete().eq('id', org.user_id);
      }

      // 4. Log the action
      await logAction(req.user.id, 'DELETE', 'organization', id, { org_id: id });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

exports.resetPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: org } = await supabase
        .from('organizations')
        .select('user_id, user_profiles(username, email)')
        .eq('id', id)
        .single();
        
    if (!org?.user_id) throw new Error('Organization has no login account');

    const newPassword = generatePassword();
    await supabase.from('user_profiles').update({ password: newPassword }).eq('id', org.user_id);

    res.json({ 
        success: true, 
        newPassword,
        username: org.user_profiles?.username || org.user_profiles?.email 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
