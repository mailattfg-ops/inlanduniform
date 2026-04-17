const supabase = require('../config/supabase');
const crypto = require('crypto');

// Utility for password generation
const generatePassword = () => crypto.randomBytes(4).toString('hex').toUpperCase();

exports.listEmployees = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createEmployee = async (req, res) => {
  const { full_name, employee_id, designation, department, contact_mobile, email, joining_date } = req.body;
  
  try {
    // 1. Check for existing Employee ID
    const { data: existing } = await supabase.from('employees').select('id').eq('employee_id', employee_id).maybeSingle();
    if (existing) return res.status(400).json({ error: 'Employee ID already exists' });

    // 2. Generate Credentials (Pattern: name+id@inland.com)
    const namePrefix = full_name.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '');
    const cleanId = employee_id.toLowerCase().replace(/[^a-z0-9]/g, '');
    const empEmail = `${namePrefix}${cleanId}@inland.com`;
    const generatedPassword = generatePassword();
    
    // Correct Staff Role ID
    const STAFF_ROLE_ID = '7dd424fd-6aaf-4034-ae99-bc82c93a1e7d'; 

    // 3. Create User Profile
    const { data: userData, error: userError } = await supabase
      .from('user_profiles')
      .insert([{
        full_name,
        email: empEmail,
        password: generatedPassword,
        user_type_id: STAFF_ROLE_ID
      }])
      .select()
      .single();

    if (userError) throw userError;

    // 4. Create Employee Record
    const { data: empData, error: empError } = await supabase
      .from('employees')
      .insert([{
        full_name,
        employee_id,
        designation,
        department,
        contact_mobile,
        email, // Professional email if any
        joining_date: joining_date || new Date().toISOString().split('T')[0],
        user_id: userData.id
      }])
      .select()
      .single();

    if (empError) {
      await supabase.from('user_profiles').delete().eq('id', userData.id);
      throw empError;
    }

    res.json({
      success: true,
      employee: empData,
      credentials: {
        username: empEmail,
        password: generatedPassword
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: emp } = await supabase.from('employees').select('user_id').eq('id', id).single();
    
    const { error: eError } = await supabase.from('employees').delete().eq('id', id);
    if (eError) throw eError;

    if (emp?.user_id) {
       await supabase.from('user_profiles').delete().eq('id', emp.user_id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: emp } = await supabase
        .from('employees')
        .select('user_id, user_profiles(email)')
        .eq('id', id)
        .single();
        
    if (!emp?.user_id) throw new Error('Employee has no portal account');

    const newPassword = generatePassword();
    await supabase.from('user_profiles').update({ password: newPassword }).eq('id', emp.user_id);

    res.json({ 
        success: true, 
        newPassword,
        username: emp.user_profiles?.email 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.syncUsername = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: emp, error: eError } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .single();
    
    if (eError || !emp) throw new Error('Employee not found');
    if (!emp.user_id) throw new Error('Employee has no portal account');

    const namePrefix = emp.full_name.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '');
    const cleanId = emp.employee_id.toLowerCase().replace(/[^a-z0-9]/g, '');
    const newEmail = `${namePrefix}${cleanId}@inland.com`;

    await supabase.from('user_profiles').update({ email: newEmail }).eq('id', emp.user_id);

    res.json({ success: true, newUsername: newEmail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
