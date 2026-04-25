const supabase = require('../config/supabase');

// --- Departments Management ---

exports.getDepartments = async (req, res) => {
  const { orgId } = req.query;
  const user = req.user;

  try {
    let query = supabase
      .from('departments')
      .select('*, organizations(name)')
      .order('created_at', { ascending: false });

    // Strict Enforcement logic
    if (user.role && (user.role.toLowerCase() === 'school' || user.role.toLowerCase() === 'organization')) {
      const userOrgId = user.schoolId || user.organizationId;
      if (!userOrgId) {
        return res.status(403).json({ error: 'Your account is not correctly linked to an organization record.' });
      }
      query = query.eq('organization_id', userOrgId);
    } else if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createDepartment = async (req, res) => {
  const { orgId, name } = req.body;
  try {
    const { data, error } = await supabase
      .from('departments')
      .insert([{ 
        organization_id: orgId, 
        name 
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateDepartment = async (req, res) => {
    const { id } = req.params;
    const { orgId, name } = req.body;
    try {
      const { data, error } = await supabase
        .from('departments')
        .update({ 
          organization_id: orgId, 
          name 
        })
        .eq('id', id)
        .select()
        .single();
  
      if (error) throw error;
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

exports.deleteDepartment = async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id);
  
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};
