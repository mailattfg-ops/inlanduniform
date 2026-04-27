const supabase = require('../config/supabase');

exports.listMeasurements = async (req, res) => {
  const user = req.user;
  const { orgId, deptId } = req.query;

  try {
    let query = supabase
      .from('measurements')
      .select('*, registry_members!inner(full_name, admission_no, organization_id, department_id, organizations(name))')
      .order('recorded_at', { ascending: false });

    if (orgId) {
      query = query.eq('registry_members.organization_id', orgId);
    }
    if (deptId) {
      query = query.eq('registry_members.department_id', deptId);
    }

    // Strict Enforcement logic
    const role = user.role?.toLowerCase();
    if (role === 'school' || role === 'organization' || role === 'entity') {
      if (!user.organizationId) {
        return res.status(403).json({ error: 'Your account is not correctly linked to an organization record.' });
      }
      query = query.eq('registry_members.organization_id', user.organizationId);
    }

    const { data: measurements, error } = await query;
    if (error) throw error;

    if (!measurements || measurements.length === 0) {
        return res.json([]);
    }

    // Manual Fetch for staff names (recorder)
    const recorderIds = [...new Set(measurements.map(m => m.recorded_by).filter(Boolean))];
    let profileMap = {};
    if (recorderIds.length > 0) {
        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', recorderIds);
            
        if (profiles) {
            profiles.forEach(p => {
                profileMap[p.id] = p;
            });
        }
    }

    // Merge recorder profiles
    const enriched = measurements.map(m => ({
        ...m,
        user_profiles: profileMap[m.recorded_by] || { full_name: 'System' }
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listConfig = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('measurement_config')
      .select('*')
      .order('display_order', { ascending: true });
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.saveMeasurement = async (req, res) => {
  const { 
    member_id, 
    dynamic_data,
    suggested_size, 
    notes,
    recorded_by
  } = req.body;

  try {
    const { data, error } = await supabase
      .from('measurements')
      .insert([{
        member_id,
        recorded_by: recorded_by || req.user.id,
        dynamic_data,
        suggested_size,
        notes,
        status: 'Pending',
        recorded_at: new Date()
      }])
      .select()
      .single();

    if (error) throw error;

    // Log the action
    const { logAction } = require('../utils/logger');
    await logAction(req.user.id, 'SAVE', 'measurement', member_id, { 
        suggested_size,
        notes: notes?.substring(0, 50) 
    });

    res.json({ success: true, measurement: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStudentHistory = async (req, res) => {
  const { memberId } = req.params;
  try {
    // 1. Fetch measurements
    const { data: measurements, error } = await supabase
      .from('measurements')
      .select('*')
      .eq('member_id', memberId)
      .order('recorded_at', { ascending: false });

    if (error) throw error;

    if (!measurements || measurements.length === 0) {
        return res.json([]);
    }

    // 2. Fetch unique recorder IDs
    const recorderIds = [...new Set(measurements.map(m => m.recorded_by).filter(Boolean))];
    
    let profileMap = {};
    if (recorderIds.length > 0) {
        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', recorderIds);
            
        if (profiles) {
            profiles.forEach(p => {
                profileMap[p.id] = p;
            });
        }
    }

    // 3. Merge data
    const merged = measurements.map(m => ({
        ...m,
        user_profiles: profileMap[m.recorded_by] || { full_name: 'System' }
    }));

    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.addConfig = async (req, res) => {
    try {
        const { label, unit, display_order, is_required } = req.body;
        const { data, error } = await supabase
            .from('measurement_config')
            .insert([{ label, unit, display_order, is_required }])
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteConfig = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('measurement_config')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Cannot delete this label. It might be linked to historical records." });
    }
};

exports.updateStatus = async (req, res) => {
    const { id } = req.params;
    const { status, remarks } = req.body;
    const adminId = req.user.id;

    try {
        const { data, error } = await supabase
            .from('measurements')
            .update({ 
                status: status || 'Approved',
                reviewer_id: adminId,
                reviewed_at: new Date()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Log the action
        const { logAction } = require('../utils/logger');
        await logAction(adminId, (status || 'APPROVED').toUpperCase(), 'measurement', id, { 
            message: `Measurement marked as ${status}`,
            remarks
        });

        res.json({ success: true, measurement: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
