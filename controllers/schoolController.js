const supabase = require('../config/supabase');

// --- Schools Management ---

exports.getSchools = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    console.log(`[DB] Fetched ${data.length} schools`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSchool = async (req, res) => {
  const { name, address } = req.body;
  try {
    const { data, error } = await supabase
      .from('schools')
      .insert([{ name, address }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSchool = async (req, res) => {
    const { id } = req.params;
    const { name, address } = req.body;
    try {
      const { data, error } = await supabase
        .from('schools')
        .update({ name, address })
        .eq('id', id)
        .select()
        .single();
  
      if (error) throw error;
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

exports.deleteSchool = async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase
        .from('schools')
        .delete()
        .eq('id', id);
  
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

// --- Classes Management ---

exports.getClasses = async (req, res) => {
  const { schoolId } = req.query;
  try {
    let query = supabase
      .from('classes')
      .select('*, schools(name)')
      .order('created_at', { ascending: false });

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createClass = async (req, res) => {
  const { schoolId, name } = req.body;
  try {
    const { data, error } = await supabase
      .from('classes')
      .insert([{ school_id: schoolId, name }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateClass = async (req, res) => {
    const { id } = req.params;
    const { schoolId, name } = req.body;
    try {
      const { data, error } = await supabase
        .from('classes')
        .update({ school_id: schoolId, name })
        .eq('id', id)
        .select()
        .single();
  
      if (error) throw error;
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};

exports.deleteClass = async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', id);
  
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
};
