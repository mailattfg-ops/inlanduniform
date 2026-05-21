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
    const { name, address, industry_id, assigned_staff_id } = req.body;
    try {
      const { data, error } = await supabase
        .from('organizations')
        .update({ name, address, industry_id, assigned_staff_id })
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

exports.getOrganizationDetails = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Get Departments
    const { data: departments } = await supabase
      .from('departments')
      .select('*')
      .eq('organization_id', id);

    // 2. Get Members and Measurement Status
    const { data: members } = await supabase
      .from('registry_members')
      .select('id')
      .eq('organization_id', id);

    let completed = 0;
    let pending = 0;

    if (members && members.length > 0) {
       const memberIds = members.map(m => m.id);
       const { data: measurements } = await supabase
         .from('measurements')
         .select('member_id, status')
         .in('member_id', memberIds);
       
       const statusMap = {};
       if (measurements) {
         measurements.forEach(m => {
             const mid = String(m.member_id);
             if (!statusMap[mid] || m.status === 'Pending') {
                 statusMap[mid] = m.status;
             }
         });
       }

       members.forEach(m => {
           const status = statusMap[String(m.id)];
           if (status === 'COMPLETED' || status === 'Completed') {
               completed++;
           } else {
               pending++;
           }
       });
    }

    res.json({
      success: true,
      departments: departments || [],
      measurements: {
        total: members ? members.length : 0,
        completed,
        pending
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAssignedStaff = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('organization_staff')
      .select(`
        id,
        employee_id,
        assigned_at,
        employees (
          full_name,
          employee_id,
          department
        )
      `)
      .eq('organization_id', id);

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.assignStaff = async (req, res) => {
  const { id } = req.params;
  const { employee_ids } = req.body; // Array of employee IDs
  
  try {
    if (!Array.isArray(employee_ids)) {
      return res.status(400).json({ error: 'employee_ids must be an array' });
    }

    // Prepare inserts
    const inserts = employee_ids.map(empId => ({
      organization_id: id,
      employee_id: empId
    }));

    // First delete existing assignments for these employees in this org to avoid unique constraint errors?
    // Actually, it's better to just delete all current assignments and re-insert, or handle it properly.
    // We will do a full sync: delete all existing, insert new ones.
    const { error: deleteError } = await supabase
      .from('organization_staff')
      .delete()
      .eq('organization_id', id);
      
    if (deleteError) throw deleteError;

    if (inserts.length > 0) {
       const { data, error } = await supabase
         .from('organization_staff')
         .insert(inserts)
         .select();
       if (error) throw error;
    }

    res.json({ success: true, message: 'Staff assignments updated' });
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
