const supabase = require('../config/supabase');
const { logAction } = require('../utils/logger');

// Fetch allowed measurement fields for a specific staff member in an organization
exports.getMeasurements = async (req, res) => {
  const { organization_id, employee_id } = req.params;

  try {
    const { data, error } = await supabase
      .from('organization_staff')
      .select('allowed_measurement_fields, assigned_at')
      .eq('organization_id', organization_id)
      .eq('employee_id', employee_id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
         return res.status(404).json({ error: 'Staff member is not assigned to this organization.' });
      }
      throw error;
    }

    res.json({
      success: true,
      allowed_fields: data.allowed_measurement_fields || {}
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update dynamic JSON restricting measurement fields
exports.upsertMeasurements = async (req, res) => {
  const { organization_id, employee_id } = req.params;
  const { allowed_fields } = req.body;

  try {
    if (!allowed_fields || typeof allowed_fields !== 'object') {
      return res.status(400).json({ error: 'allowed_fields must be a valid JSON object.' });
    }

    // 1. Verify staff is assigned
    const { data: staff, error: fetchError } = await supabase
      .from('organization_staff')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('employee_id', employee_id)
      .single();

    if (fetchError || !staff) {
      return res.status(404).json({ error: 'Staff member is not assigned to this organization.' });
    }

    // 2. Update the JSONB column
    const { data, error } = await supabase
      .from('organization_staff')
      .update({ allowed_measurement_fields: allowed_fields })
      .eq('organization_id', organization_id)
      .eq('employee_id', employee_id)
      .select('allowed_measurement_fields')
      .single();

    if (error) throw error;

    // 3. Log the action
    await logAction(req.user.id, 'UPDATE', 'organization_staff_restrictions', staff.id, { 
      organization_id, 
      employee_id, 
      updated_keys: Object.keys(allowed_fields) 
    });

    res.json({
      success: true,
      message: 'Measurement field restrictions updated successfully.',
      allowed_fields: data.allowed_measurement_fields
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
