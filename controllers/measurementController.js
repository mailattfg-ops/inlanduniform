const supabase = require('../config/supabase');

exports.listMeasurements = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('measurements')
      .select('*, students(full_name, admission_no)')
      .order('recorded_at', { ascending: false });

    if (error) throw error;
    res.json(data);
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
    student_id, 
    dynamic_data,
    suggested_size, 
    notes 
  } = req.body;

  try {
    const { data, error } = await supabase
      .from('measurements')
      .upsert({
        student_id,
        recorded_by: req.user.id,
        dynamic_data,
        suggested_size,
        notes,
        recorded_at: new Date()
      }, { onConflict: 'student_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, measurement: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStudentHistory = async (req, res) => {
  const { studentId } = req.params;
  try {
    const { data, error } = await supabase
      .from('measurements')
      .select('*')
      .eq('student_id', studentId)
      .order('recorded_at', { ascending: false });

    if (error) throw error;
    res.json(data);
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
